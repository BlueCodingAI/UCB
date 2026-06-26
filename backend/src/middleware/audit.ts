import type { Request } from 'express';
import { db } from '../db/connection';
import { newId } from '../lib/ids';
import { now } from '../lib/time';

export interface AuditInput {
  actorType: 'admin' | 'user' | 'system';
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

/** Append an entry to the audit log (best-effort; never throws into the request). */
export function writeAudit(input: AuditInput): void {
  try {
    db.prepare(
      `INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.req?.ip ?? null,
      input.req?.header('user-agent') ?? null,
      now(),
    );
  } catch {
    /* swallow audit errors */
  }
}
