import { db } from '../db/connection';
import { newId } from '../lib/ids';
import { now, SECOND } from '../lib/time';
import { logger } from '../lib/logger';

export type JobType =
  | 'kb_index'
  | 'kb_reindex'
  | 'embed_chunks'
  | 'broadcast_send'
  | 'reminder_dispatch'
  | 'notification_send';

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();

/** Modules register their job handlers at import time. */
export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

/** Enqueue a job (optionally delayed). */
export function enqueue(type: JobType, payload: Record<string, unknown> = {}, runAfter = now()): string {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO job_queue (id, job_type, payload_json, status, attempts, max_attempts, run_after, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', 0, 5, ?, ?, ?)`,
  ).run(id, type, JSON.stringify(payload), runAfter, ts, ts);
  return id;
}

interface JobRow {
  id: string;
  job_type: JobType;
  payload_json: string;
  attempts: number;
  max_attempts: number;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const ts = now();
    const job = db
      .prepare(
        `SELECT id, job_type, payload_json, attempts, max_attempts FROM job_queue
          WHERE status IN ('queued','failed') AND run_after <= ?
          ORDER BY run_after ASC LIMIT 1`,
      )
      .get(ts) as JobRow | undefined;
    if (!job) return;

    // Lease it.
    db.prepare(`UPDATE job_queue SET status='running', locked_at=?, updated_at=? WHERE id=?`).run(ts, ts, job.id);

    const handler = handlers.get(job.job_type);
    if (!handler) {
      logger.warn({ type: job.job_type }, 'no handler registered for job; marking dead');
      db.prepare(`UPDATE job_queue SET status='dead', last_error='no handler', updated_at=? WHERE id=?`).run(now(), job.id);
      return;
    }

    try {
      await handler(JSON.parse(job.payload_json));
      db.prepare(`UPDATE job_queue SET status='done', updated_at=? WHERE id=?`).run(now(), job.id);
    } catch (err) {
      const attempts = job.attempts + 1;
      const dead = attempts >= job.max_attempts;
      const backoff = now() + Math.min(60, 2 ** attempts) * SECOND;
      db.prepare(
        `UPDATE job_queue SET status=?, attempts=?, last_error=?, run_after=?, updated_at=? WHERE id=?`,
      ).run(dead ? 'dead' : 'failed', attempts, String(err), backoff, now(), job.id);
      logger.error({ err, type: job.job_type, attempts }, 'job failed');
    }
  } finally {
    running = false;
  }
}

/** Start the in-process polling worker. */
export function startWorker(intervalMs = 5 * SECOND): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();
  logger.info('job worker started');
}

export function stopWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
