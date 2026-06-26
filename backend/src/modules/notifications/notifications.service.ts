import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { logger } from '../../lib/logger';
import { registerJobHandler } from '../../services/jobs';
import { sendMail } from '../../services/email';
import type { Locale } from '../../types';

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  language: Locale;
  channel: string;
  actionUrl: string | null;
  readAt: number | null;
  createdAt: number;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  language: Locale;
  channel: string;
  action_url: string | null;
  read_at: number | null;
  created_at: number;
}

export function mapNotification(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    language: row.language,
    channel: row.channel,
    actionUrl: row.action_url,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// createNotification (INTERNAL CONTRACT)
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'reminder'
  | 'recommendation'
  | 'counselling'
  | 'payment'
  | 'system'
  | 'broadcast'
  | 'deadline';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  language?: Locale;
  channel?: NotificationChannel;
  actionUrl?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  scheduledAt?: number | null;
  broadcastId?: string | null;
}

/**
 * Insert a notifications row. For in_app channel the notification is considered
 * immediately delivered (delivery_status='sent', sent_at=now). Returns the new id.
 */
export function createNotification(input: CreateNotificationInput): string {
  const id = newId();
  const ts = now();
  const channel: NotificationChannel = input.channel ?? 'in_app';
  const isInApp = channel === 'in_app';
  db.prepare(
    `INSERT INTO notifications
       (id, user_id, broadcast_id, type, title, body, language, channel, action_url,
        related_entity_type, related_entity_id, delivery_status, scheduled_at, sent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.broadcastId ?? null,
    input.type,
    input.title,
    input.body,
    input.language ?? 'en',
    channel,
    input.actionUrl ?? null,
    input.relatedEntityType ?? null,
    input.relatedEntityId ?? null,
    isInApp ? 'sent' : 'pending',
    input.scheduledAt ?? null,
    isInApp ? ts : null,
    ts,
  );
  return id;
}

// ---------------------------------------------------------------------------
// sendBroadcast — fan out a broadcasts row to its audience
// ---------------------------------------------------------------------------

interface BroadcastRow {
  id: string;
  title: string;
  body_en: string | null;
  body_hi: string | null;
  body_mr: string | null;
  default_language: Locale;
  audience_type: string;
  audience_filter_json: string;
  status: string;
}

interface AudienceUser {
  id: string;
  preferred_language: Locale;
}

function resolveBody(row: BroadcastRow, lang: Locale): string {
  const byLang: Record<Locale, string | null> = {
    en: row.body_en,
    hi: row.body_hi,
    mr: row.body_mr,
  };
  return byLang[lang] || row.body_en || row.body_hi || row.body_mr || row.title;
}

/** Resolve the recipient set from a broadcast's audience filter. */
function resolveAudience(row: BroadcastRow): AudienceUser[] {
  let filter: Record<string, unknown> = {};
  try {
    filter = JSON.parse(row.audience_filter_json) as Record<string, unknown>;
  } catch {
    filter = {};
  }

  const base = `SELECT id, preferred_language FROM users WHERE status = 'active'`;

  switch (row.audience_type) {
    case 'plan': {
      const plan = String(filter.plan ?? filter.planCode ?? '');
      if (!plan) return [];
      return db.prepare(`${base} AND current_plan_code = ?`).all(plan) as AudienceUser[];
    }
    case 'language': {
      const lang = String(filter.language ?? filter.lang ?? '');
      if (!lang) return [];
      return db.prepare(`${base} AND preferred_language = ?`).all(lang) as AudienceUser[];
    }
    case 'location': {
      const city = filter.city != null ? String(filter.city) : null;
      const district = filter.district != null ? String(filter.district) : null;
      if (city) return db.prepare(`${base} AND location_city = ?`).all(city) as AudienceUser[];
      if (district) return db.prepare(`${base} AND location_district = ?`).all(district) as AudienceUser[];
      return [];
    }
    case 'all':
    default:
      return db.prepare(base).all() as AudienceUser[];
  }
}

/**
 * Fan out a broadcast to its resolved audience, creating one in_app notification
 * per user in their preferred language. Updates the broadcast's counts + status.
 */
export async function sendBroadcast(broadcastId: string): Promise<void> {
  const row = db
    .prepare(
      `SELECT id, title, body_en, body_hi, body_mr, default_language,
              audience_type, audience_filter_json, status
         FROM broadcasts WHERE id = ?`,
    )
    .get(broadcastId) as BroadcastRow | undefined;

  if (!row) {
    logger.warn({ broadcastId }, 'broadcast not found; skipping send');
    return;
  }
  if (row.status === 'sent' || row.status === 'cancelled') {
    logger.info({ broadcastId, status: row.status }, 'broadcast already finalized; skipping');
    return;
  }

  const ts = now();
  db.prepare(`UPDATE broadcasts SET status = 'sending', updated_at = ? WHERE id = ?`).run(ts, broadcastId);

  const recipients = resolveAudience(row);

  let sent = 0;
  let failed = 0;
  for (const user of recipients) {
    const lang = (user.preferred_language || row.default_language) as Locale;
    try {
      createNotification({
        userId: user.id,
        type: 'broadcast',
        title: row.title,
        body: resolveBody(row, lang),
        language: lang,
        channel: 'in_app',
        broadcastId: row.id,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, broadcastId, userId: user.id }, 'broadcast fan-out failed for user');
    }
  }

  db.prepare(
    `UPDATE broadcasts
        SET total_recipients = ?, sent_count = ?, failed_count = ?,
            status = 'sent', sent_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(recipients.length, sent, failed, now(), now(), broadcastId);

  logger.info({ broadcastId, recipients: recipients.length, sent, failed }, 'broadcast dispatched');
}

// ---------------------------------------------------------------------------
// reminder_dispatch — create reminder notifications from due items
// ---------------------------------------------------------------------------

interface DueRecommendationRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  language: Locale;
  due_at: number | null;
}

interface DueAppointmentRow {
  id: string;
  user_id: string;
  mode: string;
  scheduled_start: number;
}

/** Create reminder notifications for due recommendations and upcoming appointments. */
async function dispatchReminders(): Promise<void> {
  const ts = now();

  // Pending recommendations whose due date has arrived and have no reminder yet.
  const recos = db
    .prepare(
      `SELECT r.id, r.user_id, r.title, r.description, r.language, r.due_at
         FROM recommendations r
        WHERE r.status = 'pending' AND r.due_at IS NOT NULL AND r.due_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
             WHERE n.user_id = r.user_id AND n.type = 'reminder'
               AND n.related_entity_type = 'recommendation' AND n.related_entity_id = r.id
          )`,
    )
    .all(ts) as DueRecommendationRow[];

  for (const r of recos) {
    createNotification({
      userId: r.user_id,
      type: 'reminder',
      title: r.title,
      body: r.description ?? r.title,
      language: r.language,
      channel: 'in_app',
      relatedEntityType: 'recommendation',
      relatedEntityId: r.id,
      actionUrl: '/app/next-steps',
    });
  }

  // Appointments scheduled within the next 24h that have no reminder yet.
  const horizon = ts + 24 * 60 * 60 * 1000;
  const appts = db
    .prepare(
      `SELECT a.id, a.user_id, a.mode, a.scheduled_start
         FROM counselling_appointments a
        WHERE a.status IN ('scheduled','confirmed')
          AND a.scheduled_start > ? AND a.scheduled_start <= ?
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
             WHERE n.user_id = a.user_id AND n.type = 'counselling'
               AND n.related_entity_type = 'appointment' AND n.related_entity_id = a.id
          )`,
    )
    .all(ts, horizon) as DueAppointmentRow[];

  for (const a of appts) {
    createNotification({
      userId: a.user_id,
      type: 'counselling',
      title: 'Upcoming counselling session',
      body: `You have a ${a.mode} counselling session scheduled soon.`,
      channel: 'in_app',
      relatedEntityType: 'appointment',
      relatedEntityId: a.id,
      actionUrl: '/app/counselling',
    });
  }

  logger.info({ recommendations: recos.length, appointments: appts.length }, 'reminders dispatched');
}

// ---------------------------------------------------------------------------
// notification_send — deliver a queued email notification (best effort)
// ---------------------------------------------------------------------------

interface QueuedEmailRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  channel: string;
  delivery_status: string;
  email: string | null;
}

/** Best-effort send of a queued email-channel notification via the email service. */
async function sendQueuedNotification(notificationId: string): Promise<void> {
  const row = db
    .prepare(
      `SELECT n.id, n.user_id, n.title, n.body, n.channel, n.delivery_status, u.email
         FROM notifications n
         JOIN users u ON u.id = n.user_id
        WHERE n.id = ?`,
    )
    .get(notificationId) as QueuedEmailRow | undefined;

  if (!row) {
    logger.warn({ notificationId }, 'queued notification not found');
    return;
  }
  if (row.delivery_status !== 'pending') {
    return;
  }
  if (row.channel !== 'email') {
    // Only email delivery is wired up here; mark others skipped.
    db.prepare(`UPDATE notifications SET delivery_status = 'skipped' WHERE id = ?`).run(notificationId);
    return;
  }
  if (!row.email) {
    db.prepare(`UPDATE notifications SET delivery_status = 'skipped', failure_reason = ? WHERE id = ?`).run(
      'no email on file',
      notificationId,
    );
    return;
  }

  try {
    await sendMail({ to: row.email, subject: row.title, html: `<p>${row.body}</p>`, text: row.body });
    db.prepare(`UPDATE notifications SET delivery_status = 'sent', sent_at = ? WHERE id = ?`).run(now(), notificationId);
  } catch (err) {
    db.prepare(`UPDATE notifications SET delivery_status = 'failed', failure_reason = ? WHERE id = ?`).run(
      String(err),
      notificationId,
    );
    logger.error({ err, notificationId }, 'notification email send failed');
  }
}

// ---------------------------------------------------------------------------
// Job handler registration (runs at module import / boot)
// ---------------------------------------------------------------------------

registerJobHandler('broadcast_send', async (payload) => {
  const broadcastId = String((payload as { broadcastId?: unknown }).broadcastId ?? '');
  if (!broadcastId) {
    logger.warn('broadcast_send job missing broadcastId');
    return;
  }
  await sendBroadcast(broadcastId);
});

registerJobHandler('reminder_dispatch', async () => {
  await dispatchReminders();
});

registerJobHandler('notification_send', async (payload) => {
  const notificationId = String((payload as { notificationId?: unknown }).notificationId ?? '');
  if (!notificationId) {
    logger.warn('notification_send job missing notificationId');
    return;
  }
  await sendQueuedNotification(notificationId);
});
