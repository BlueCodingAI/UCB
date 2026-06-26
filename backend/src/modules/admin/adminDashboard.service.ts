import { db } from '../../db/connection';
import { now, DAY, istDateKey, toISO } from '../../lib/time';
import type { Locale } from '../../types';

export interface DashboardData {
  totalUsers: number;
  usersByPlan: { freemium: number; premium: number; super_premium: number };
  usersByStatus: { active: number; suspended: number; deleted: number };
  newUsers30d: number;
  chatsToday: number;
  voiceToday: number;
  chats30d: number;
  fallbackRate: number; // 0..1
  revenuePaise: number;
  revenue30dPaise: number;
  openLeads: number;
  usageSeries: { date: string; chats: number }[];
  kbStatus: {
    indexed: number;
    pending: number;
    processing: number;
    failed: number;
    stale: number;
    totalDocuments: number;
    totalChunks: number;
  };
  recentPayments: {
    id: string;
    userName: string | null;
    planCode: string;
    amountPaise: number;
    status: string;
    createdAt: number;
  }[];
  bannerTotals: { impressions: number; clicks: number; activeBanners: number };
  generatedAt: number;
}

type SqlParam = string | number | null;

function count(sql: string, ...params: SqlParam[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

/** Assemble the admin dashboard data in the exact shape the dashboard page consumes. */
export function getDashboard(): DashboardData {
  const ts = now();
  const since30d = ts - 30 * DAY;
  const todayKey = istDateKey(ts);

  const totalUsers = count('SELECT COUNT(*) AS n FROM users');

  const planRows = db
    .prepare('SELECT current_plan_code AS code, COUNT(*) AS n FROM users GROUP BY current_plan_code')
    .all() as { code: string; n: number }[];
  const usersByPlan = { freemium: 0, premium: 0, super_premium: 0 };
  for (const r of planRows) {
    if (r.code in usersByPlan) (usersByPlan as Record<string, number>)[r.code] = r.n;
  }

  const statusRows = db.prepare('SELECT status, COUNT(*) AS n FROM users GROUP BY status').all() as {
    status: string;
    n: number;
  }[];
  const usersByStatus = { active: 0, suspended: 0, deleted: 0 };
  for (const r of statusRows) {
    if (r.status in usersByStatus) (usersByStatus as Record<string, number>)[r.status] = r.n;
  }

  const newUsers30d = count('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', since30d);

  const chatsToday = (db
    .prepare('SELECT COALESCE(SUM(chat_count), 0) AS n FROM chat_usage_daily WHERE usage_date = ?')
    .get(todayKey) as { n: number }).n;
  const voiceToday = (db
    .prepare('SELECT COALESCE(SUM(voice_count), 0) AS n FROM chat_usage_daily WHERE usage_date = ?')
    .get(todayKey) as { n: number }).n;
  const chats30d = count(
    `SELECT COUNT(*) AS n FROM chat_messages WHERE role = 'user' AND created_at >= ?`,
    since30d,
  );

  const assistant30d = count(
    `SELECT COUNT(*) AS n FROM chat_messages WHERE role = 'assistant' AND created_at >= ?`,
    since30d,
  );
  const fallback30d = count(
    `SELECT COUNT(*) AS n FROM chat_messages WHERE role = 'assistant' AND is_fallback = 1 AND created_at >= ?`,
    since30d,
  );
  const fallbackRate = assistant30d > 0 ? Math.round((fallback30d / assistant30d) * 10000) / 10000 : 0;

  const revenuePaise = (db
    .prepare(`SELECT COALESCE(SUM(amount_paise), 0) AS n FROM payments WHERE status = 'paid'`)
    .get() as { n: number }).n;
  const revenue30dPaise = (db
    .prepare(`SELECT COALESCE(SUM(amount_paise), 0) AS n FROM payments WHERE status = 'paid' AND created_at >= ?`)
    .get(since30d) as { n: number }).n;

  const openLeads = count(
    `SELECT COUNT(*) AS n FROM counselling_requests WHERE status IN ('new','contacted','scheduled','in_progress')`,
  );

  // Usage series: last 14 days of chat volume, zero-filled.
  const seriesDays = 14;
  const sinceKey = istDateKey(ts - (seriesDays - 1) * DAY);
  const usageRows = db
    .prepare(
      `SELECT usage_date AS date, COALESCE(SUM(chat_count), 0) AS chats
         FROM chat_usage_daily WHERE usage_date >= ? GROUP BY usage_date`,
    )
    .all(sinceKey) as { date: string; chats: number }[];
  const usageMap = new Map(usageRows.map((r) => [r.date, r.chats]));
  const usageSeries: { date: string; chats: number }[] = [];
  for (let i = seriesDays - 1; i >= 0; i--) {
    const key = istDateKey(ts - i * DAY);
    usageSeries.push({ date: key, chats: usageMap.get(key) ?? 0 });
  }

  const kbRows = db
    .prepare('SELECT index_status, COUNT(*) AS n FROM kb_documents WHERE deleted_at IS NULL GROUP BY index_status')
    .all() as { index_status: string; n: number }[];
  const kbByStatus: Record<string, number> = {};
  let totalDocuments = 0;
  for (const r of kbRows) {
    kbByStatus[r.index_status] = r.n;
    totalDocuments += r.n;
  }
  const totalChunks = count('SELECT COUNT(*) AS n FROM kb_chunks WHERE is_active = 1');

  const recentPayments = (db
    .prepare(
      `SELECT p.id, p.plan_code AS planCode, p.amount_paise AS amountPaise, p.status, p.created_at AS createdAt,
              u.full_name AS userName
         FROM payments p LEFT JOIN users u ON u.id = p.user_id
        ORDER BY p.created_at DESC LIMIT 8`,
    )
    .all() as { id: string; planCode: string; amountPaise: number; status: string; createdAt: number; userName: string | null }[]).map(
    (r) => ({
      id: r.id,
      userName: r.userName ?? null,
      planCode: r.planCode,
      amountPaise: r.amountPaise,
      status: r.status,
      createdAt: r.createdAt,
    }),
  );

  const banner = db
    .prepare('SELECT COALESCE(SUM(impression_count), 0) AS imp, COALESCE(SUM(click_count), 0) AS clk FROM banners')
    .get() as { imp: number; clk: number };
  const activeBanners = count('SELECT COUNT(*) AS n FROM banners WHERE is_active = 1');

  return {
    totalUsers,
    usersByPlan,
    usersByStatus,
    newUsers30d,
    chatsToday,
    voiceToday,
    chats30d,
    fallbackRate,
    revenuePaise,
    revenue30dPaise,
    openLeads,
    usageSeries,
    kbStatus: {
      indexed: kbByStatus.indexed ?? 0,
      pending: kbByStatus.pending ?? 0,
      processing: kbByStatus.processing ?? 0,
      failed: kbByStatus.failed ?? 0,
      stale: kbByStatus.stale ?? 0,
      totalDocuments,
      totalChunks,
    },
    recentPayments,
    bannerTotals: { impressions: banner.imp, clicks: banner.clk, activeBanners },
    generatedAt: ts,
  };
}

export interface AuditLogItem {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: number;
  createdAtIso: string | null;
}

function safeParse(value: string | null | undefined): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function mapAudit(r: any): AuditLogItem {
  return {
    id: r.id,
    actorType: r.actor_type,
    actorId: r.actor_id ?? null,
    action: r.action,
    entityType: r.entity_type ?? null,
    entityId: r.entity_id ?? null,
    before: safeParse(r.before_json),
    after: safeParse(r.after_json),
    ipAddress: r.ip_address ?? null,
    userAgent: r.user_agent ?? null,
    createdAt: r.created_at,
    createdAtIso: toISO(r.created_at),
  };
}

export interface AuditFilters {
  actorType?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
}

/** Cursor-paginated audit log (newest first), id as opaque cursor. */
export function listAuditLogsCursor(
  filters: AuditFilters,
  limit: number,
  cursor: string | null,
): { items: AuditLogItem[]; nextCursor: string | null; hasMore: boolean } {
  const where: string[] = [];
  const params: SqlParam[] = [];
  applyAuditFilters(filters, where, params);
  if (cursor) {
    where.push('id < ?');
    params.push(cursor);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM audit_log ${whereSql} ORDER BY id DESC LIMIT ?`)
    .all(...params, limit + 1) as any[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(mapAudit);
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { items, nextCursor, hasMore };
}

/** Offset-paginated audit log (for table view). */
export function listAuditLogsOffset(
  filters: AuditFilters,
  page: number,
  pageSize: number,
): { items: AuditLogItem[]; total: number } {
  const where: string[] = [];
  const params: SqlParam[] = [];
  applyAuditFilters(filters, where, params);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = count(`SELECT COUNT(*) AS n FROM audit_log ${whereSql}`, ...params);
  const rows = db
    .prepare(`SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as any[];
  return { items: rows.map(mapAudit), total };
}

function applyAuditFilters(filters: AuditFilters, where: string[], params: SqlParam[]): void {
  if (filters.actorType) {
    where.push('actor_type = ?');
    params.push(filters.actorType);
  }
  if (filters.actorId) {
    where.push('actor_id = ?');
    params.push(filters.actorId);
  }
  if (filters.action) {
    where.push('action = ?');
    params.push(filters.action);
  }
  if (filters.entityType) {
    where.push('entity_type = ?');
    params.push(filters.entityType);
  }
  if (filters.entityId) {
    where.push('entity_id = ?');
    params.push(filters.entityId);
  }
}

export interface ChatLogItem {
  id: string;
  sessionId: string;
  userId: string | null;
  role: string;
  content: string;
  language: Locale;
  inputMode: string;
  isGrounded: boolean;
  isFallback: boolean;
  retrievalScore: number | null;
  model: string | null;
  createdAt: number;
  createdAtIso: string | null;
  user: { id: string; fullName: string | null; email: string | null } | null;
}

function mapChatLog(r: any): ChatLogItem {
  return {
    id: r.id,
    sessionId: r.session_id,
    userId: r.user_id ?? null,
    role: r.role,
    content: r.content,
    language: (r.language ?? 'en') as Locale,
    inputMode: r.input_mode,
    isGrounded: !!r.is_grounded,
    isFallback: !!r.is_fallback,
    retrievalScore: r.retrieval_score ?? null,
    model: r.model ?? null,
    createdAt: r.created_at,
    createdAtIso: toISO(r.created_at),
    user: r.user_id ? { id: r.user_id, fullName: r.u_full_name ?? null, email: r.u_email ?? null } : null,
  };
}

export interface ChatLogFilters {
  fallbackOnly?: boolean;
  role?: string;
  language?: string;
  sessionId?: string;
}

/** Cursor-paginated recent chat messages for KB-gap analysis (newest first). */
export function listChatLogs(
  filters: ChatLogFilters,
  limit: number,
  cursor: string | null,
): { items: ChatLogItem[]; nextCursor: string | null; hasMore: boolean } {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (filters.fallbackOnly) where.push('m.is_fallback = 1');
  if (filters.role) {
    where.push('m.role = ?');
    params.push(filters.role);
  }
  if (filters.language) {
    where.push('m.language = ?');
    params.push(filters.language);
  }
  if (filters.sessionId) {
    where.push('m.session_id = ?');
    params.push(filters.sessionId);
  }
  if (cursor) {
    where.push('m.id < ?');
    params.push(cursor);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT m.*, u.full_name AS u_full_name, u.email AS u_email
         FROM chat_messages m
         LEFT JOIN users u ON u.id = m.user_id
         ${whereSql}
         ORDER BY m.id DESC
         LIMIT ?`,
    )
    .all(...params, limit + 1) as any[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(mapChatLog);
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { items, nextCursor, hasMore };
}
