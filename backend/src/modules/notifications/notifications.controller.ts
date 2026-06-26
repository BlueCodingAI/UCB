import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../../db/connection';
import { ok, noContent } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { now } from '../../lib/time';
import { parseCursor } from '../../lib/paginate';
import { mapNotification, type NotificationDTO } from './notifications.service';
import type { UpdatePreferencesInput } from './notifications.schema';

/** Wrap an async controller so thrown errors reach the central error handler. */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  language: NotificationDTO['language'];
  channel: string;
  action_url: string | null;
  read_at: number | null;
  created_at: number;
}

/** GET / — cursor-paginated in_app feed, newest first, optional ?type= filter. */
export const list = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const { limit, cursor } = parseCursor(req, 20);
  const type = req.query.type ? String(req.query.type) : null;

  const where: string[] = [`user_id = ?`, `channel = 'in_app'`];
  const args: unknown[] = [userId];
  if (type) {
    where.push('type = ?');
    args.push(type);
  }
  // Cursor is the last seen id (ULIDs are time-sortable); fetch strictly older.
  if (cursor) {
    where.push('id < ?');
    args.push(cursor);
  }

  const rows = db
    .prepare(
      `SELECT id, type, title, body, language, channel, action_url, read_at, created_at
         FROM notifications
        WHERE ${where.join(' AND ')}
        ORDER BY id DESC
        LIMIT ?`,
    )
    .all(...args, limit + 1) as NotificationRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  ok(res, page.map(mapNotification), { pagination: { limit, nextCursor, hasMore } });
});

/** GET /unread-count → { count }. */
export const unreadCount = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM notifications
        WHERE user_id = ? AND channel = 'in_app' AND read_at IS NULL`,
    )
    .get(userId) as { count: number };
  ok(res, { count: row.count });
});

/** POST /:id/read — mark a single notification read (204). */
export const markRead = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const id = req.params.id;
  const existing = db
    .prepare(`SELECT id, read_at FROM notifications WHERE id = ? AND user_id = ?`)
    .get(id, userId) as { id: string; read_at: number | null } | undefined;
  if (!existing) throw Errors.notFound('Notification not found');
  if (existing.read_at == null) {
    db.prepare(`UPDATE notifications SET read_at = ? WHERE id = ?`).run(now(), id);
  }
  noContent(res);
});

/** POST /read-all — mark all unread in_app notifications read (204). */
export const markAllRead = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  db.prepare(
    `UPDATE notifications SET read_at = ?
      WHERE user_id = ? AND channel = 'in_app' AND read_at IS NULL`,
  ).run(now(), userId);
  noContent(res);
});

interface PreferenceRow {
  notify_in_app: number;
  notify_email: number;
  notify_whatsapp: number;
  notify_sms: number;
}

function mapPreferences(row: PreferenceRow) {
  return {
    notifyInApp: row.notify_in_app === 1,
    notifyEmail: row.notify_email === 1,
    notifyWhatsapp: row.notify_whatsapp === 1,
    notifySms: row.notify_sms === 1,
  };
}

/** GET /preferences → user notify_* booleans. */
export const getPreferences = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const row = db
    .prepare(`SELECT notify_in_app, notify_email, notify_whatsapp, notify_sms FROM users WHERE id = ?`)
    .get(userId) as PreferenceRow | undefined;
  if (!row) throw Errors.notFound('User not found');
  ok(res, mapPreferences(row));
});

/** PUT /preferences — update any subset of notify_* booleans. */
export const updatePreferences = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const body = req.body as UpdatePreferencesInput;

  const sets: string[] = [];
  const args: unknown[] = [];
  const colMap: Record<keyof UpdatePreferencesInput, string> = {
    notifyInApp: 'notify_in_app',
    notifyEmail: 'notify_email',
    notifyWhatsapp: 'notify_whatsapp',
    notifySms: 'notify_sms',
  };
  for (const key of Object.keys(colMap) as (keyof UpdatePreferencesInput)[]) {
    const val = body[key];
    if (val !== undefined) {
      sets.push(`${colMap[key]} = ?`);
      args.push(val ? 1 : 0);
    }
  }

  if (sets.length === 0) throw Errors.validation('No preferences to update');

  sets.push('updated_at = ?');
  args.push(now());
  args.push(userId);

  const info = db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  if (info.changes === 0) throw Errors.notFound('User not found');

  const row = db
    .prepare(`SELECT notify_in_app, notify_email, notify_whatsapp, notify_sms FROM users WHERE id = ?`)
    .get(userId) as PreferenceRow;
  ok(res, mapPreferences(row));
});
