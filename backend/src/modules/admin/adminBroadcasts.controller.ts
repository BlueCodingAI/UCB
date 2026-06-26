import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../../db/connection';
import { ok, created } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { parseOffset, offsetMeta } from '../../lib/paginate';
import { writeAudit } from '../../middleware/audit';
import { enqueue } from '../../services/jobs';
import type { CreateBroadcastInput } from './adminBroadcasts.schema';

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

interface BroadcastRow {
  id: string;
  title: string;
  body_en: string | null;
  body_hi: string | null;
  body_mr: string | null;
  default_language: string;
  audience_type: string;
  audience_filter_json: string;
  channels_json: string;
  status: string;
  scheduled_at: number | null;
  sent_at: number | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function mapBroadcast(r: BroadcastRow) {
  return {
    id: r.id,
    title: r.title,
    bodyEn: r.body_en ?? null,
    bodyHi: r.body_hi ?? null,
    bodyMr: r.body_mr ?? null,
    defaultLanguage: r.default_language,
    audienceType: r.audience_type,
    audienceFilter: safeParse<Record<string, unknown>>(r.audience_filter_json, {}),
    channels: safeParse<string[]>(r.channels_json, ['in_app']),
    status: r.status,
    scheduledAt: r.scheduled_at ?? null,
    sentAt: r.sent_at ?? null,
    totalRecipients: r.total_recipients,
    sentCount: r.sent_count,
    failedCount: r.failed_count,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SORT_COLUMNS: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  scheduledAt: 'scheduled_at',
  status: 'status',
  title: 'title',
};

/** POST / — create a broadcast (draft / scheduled / send-now). */
export const createBroadcast = asyncHandler(async (req, res) => {
  const input = req.body as CreateBroadcastInput;
  const id = newId();
  const ts = now();
  const sendNow = input.sendNow === true;
  const scheduledAt = input.scheduledAt ?? null;
  // send-now => 'sending'; future schedule => 'scheduled'; otherwise draft.
  const status = sendNow ? 'sending' : scheduledAt ? 'scheduled' : 'draft';

  db.prepare(
    `INSERT INTO broadcasts
       (id, title, body_en, body_hi, body_mr, default_language, audience_type, audience_filter_json,
        channels_json, status, scheduled_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.title,
    input.bodyEn ?? null,
    input.bodyHi ?? null,
    input.bodyMr ?? null,
    input.defaultLanguage,
    input.audienceType,
    JSON.stringify(input.audienceFilter ?? {}),
    JSON.stringify(input.channels ?? ['in_app']),
    status,
    sendNow ? null : scheduledAt,
    req.auth?.sub ?? null,
    ts,
    ts,
  );

  if (sendNow) {
    enqueue('broadcast_send', { broadcastId: id });
  }

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'broadcast.create',
    entityType: 'broadcast',
    entityId: id,
    after: { status, sendNow },
    req,
  });

  const row = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id) as BroadcastRow;
  created(res, mapBroadcast(row));
});

/** GET / — paginated broadcast list. */
export const listBroadcasts = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, sort, order, q, filters } = parseOffset(req, { sort: 'createdAt' });
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (q) {
    where.push('title LIKE ?');
    params.push(`%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = SORT_COLUMNS[sort] ?? 'created_at';

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM broadcasts ${whereSql}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM broadcasts ${whereSql} ORDER BY ${sortCol} ${order.toUpperCase()} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset) as BroadcastRow[];

  ok(res, rows.map(mapBroadcast), { pagination: offsetMeta(page, pageSize, total) });
});

/** GET /:id — broadcast detail + live delivery stats from notifications. */
export const getBroadcast = asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(req.params.id) as BroadcastRow | undefined;
  if (!row) throw Errors.notFound('Broadcast not found');

  const stats = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN delivery_status IN ('sent','delivered') THEN 1 ELSE 0 END) AS delivered,
         SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN delivery_status IN ('pending') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) AS read
       FROM notifications WHERE broadcast_id = ?`,
    )
    .get(req.params.id) as { total: number; delivered: number; failed: number; pending: number; read: number };

  ok(res, {
    ...mapBroadcast(row),
    deliveryStats: {
      total: stats.total ?? 0,
      delivered: stats.delivered ?? 0,
      failed: stats.failed ?? 0,
      pending: stats.pending ?? 0,
      read: stats.read ?? 0,
    },
  });
});

/** POST /:id/cancel — cancel a draft/scheduled/sending broadcast. */
export const cancelBroadcast = asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(req.params.id) as BroadcastRow | undefined;
  if (!row) throw Errors.notFound('Broadcast not found');
  if (row.status === 'sent' || row.status === 'cancelled') {
    throw Errors.conflict(`Broadcast cannot be cancelled from status '${row.status}'`);
  }

  db.prepare(`UPDATE broadcasts SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(now(), row.id);

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'broadcast.cancel',
    entityType: 'broadcast',
    entityId: row.id,
    before: { status: row.status },
    after: { status: 'cancelled' },
    req,
  });

  const updated = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(row.id) as BroadcastRow;
  ok(res, mapBroadcast(updated));
});
