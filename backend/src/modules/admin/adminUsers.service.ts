import { db } from '../../db/connection';
import { now } from '../../lib/time';
import { mapUser } from '../../lib/mappers';
import { Errors } from '../../lib/errors';
import type { UserDTO, PlanCode, Locale } from '../../types';
import type { UpdateUserBody } from './adminUsers.schema';

export interface UserListItem extends UserDTO {
  planName: string | null;
  planValidUntil: number | null;
}

export interface UserListResult {
  items: UserListItem[];
  total: number;
}

const SORT_COLUMNS: Record<string, string> = {
  createdAt: 'u.created_at',
  fullName: 'u.full_name',
  email: 'u.email',
  status: 'u.status',
  lastLoginAt: 'u.last_login_at',
  planValidUntil: 'u.plan_valid_until',
};

/** Offset-paginated user list with q (name/email/mobile LIKE) + plan/status/language filters. */
export function listUsers(
  q: string,
  filters: { plan?: string; status?: string; language?: string },
  page: number,
  pageSize: number,
  sort: string,
  order: 'asc' | 'desc',
): UserListResult {
  const where: string[] = [];
  const params: (string | number | null)[] = [];

  if (q) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (filters.plan) {
    where.push('u.current_plan_code = ?');
    params.push(filters.plan);
  }
  if (filters.status) {
    where.push('u.status = ?');
    params.push(filters.status);
  }
  if (filters.language) {
    where.push('u.preferred_language = ?');
    params.push(filters.language);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM users u ${whereSql}`).get(...params) as { n: number }).n;

  const sortCol = SORT_COLUMNS[sort] ?? 'u.created_at';
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  const rows = db
    .prepare(
      `SELECT u.*, p.name AS plan_name
         FROM users u
         LEFT JOIN plans p ON p.code = u.current_plan_code
         ${whereSql}
         ORDER BY ${sortCol} ${dir}
         LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as any[];

  const items = rows.map((r) => ({
    ...mapUser(r),
    planName: r.plan_name ?? null,
    planValidUntil: r.plan_valid_until ?? null,
  }));
  return { items, total };
}

export interface UserDetail {
  user: UserDTO;
  profile: Record<string, unknown> | null;
  counts: {
    chatSessions: number;
    counsellingRequests: number;
    payments: number;
  };
  currentSubscription: {
    id: string;
    planCode: PlanCode;
    status: string;
    pricePaisePaid: number;
    startsAt: number;
    validUntil: number;
    source: string;
    createdAt: number;
  } | null;
}

function mapProfile(r: any): Record<string, unknown> {
  return {
    userId: r.user_id,
    capApplicationNo: r.cap_application_no ?? null,
    capYear: r.cap_year ?? null,
    category: r.category ?? null,
    courseInterest: r.course_interest ?? null,
    cetExam: r.cet_exam ?? null,
    cetScore: r.cet_score ?? null,
    cetPercentile: r.cet_percentile ?? null,
    meritNumber: r.merit_number ?? null,
    homeUniversity: r.home_university ?? null,
    preferredDistricts: r.preferred_districts ?? null,
    preferredColleges: r.preferred_colleges ?? null,
    documentsStatus: safeParse(r.documents_status, {}),
    currentStage: r.current_stage ?? null,
    extra: safeParse(r.extra_json, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function safeParse(value: string | null | undefined, fallback: unknown): unknown {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Full 360 view of a single user. Throws not_found if absent. */
export function getUserDetail(id: string): UserDetail {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!row) throw Errors.notFound('User not found');

  const profileRow = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(id) as any;

  const chatSessions = (db.prepare('SELECT COUNT(*) AS n FROM chat_sessions WHERE user_id = ?').get(id) as {
    n: number;
  }).n;
  const counsellingRequests = (db
    .prepare('SELECT COUNT(*) AS n FROM counselling_requests WHERE user_id = ?')
    .get(id) as { n: number }).n;
  const payments = (db.prepare('SELECT COUNT(*) AS n FROM payments WHERE user_id = ?').get(id) as { n: number }).n;

  const sub = db
    .prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .get(id) as any;

  return {
    user: mapUser(row),
    profile: profileRow ? mapProfile(profileRow) : null,
    counts: { chatSessions, counsellingRequests, payments },
    currentSubscription: sub
      ? {
          id: sub.id,
          planCode: sub.plan_code as PlanCode,
          status: sub.status,
          pricePaisePaid: sub.price_paise_paid,
          startsAt: sub.starts_at,
          validUntil: sub.valid_until,
          source: sub.source,
          createdAt: sub.created_at,
        }
      : null,
  };
}

/** Raw user row (snake_case) for audit before/after snapshots. Throws if absent. */
export function getUserRow(id: string): any {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!row) throw Errors.notFound('User not found');
  return row;
}

const FIELD_MAP: Record<keyof UpdateUserBody, string> = {
  status: 'status',
  fullName: 'full_name',
  email: 'email',
  mobile: 'mobile',
  preferredLanguage: 'preferred_language',
  locationCity: 'location_city',
  locationDistrict: 'location_district',
};

/** Apply a partial update to a user. Returns the updated DTO. */
export function updateUser(id: string, patch: UpdateUserBody): UserDTO {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const key of Object.keys(patch) as (keyof UpdateUserBody)[]) {
    const col = FIELD_MAP[key];
    if (!col) continue;
    sets.push(`${col} = ?`);
    const v = (patch as Record<string, unknown>)[key];
    params.push(v == null ? null : (v as string | number));
  }
  sets.push('updated_at = ?');
  params.push(now());
  params.push(id);

  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return mapUser(getUserRow(id));
}

/** Soft-delete a user: status='deleted', deleted_at=now. */
export function softDeleteUser(id: string): void {
  const ts = now();
  db.prepare(`UPDATE users SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, id);
}

/** Override plan_valid_until after an admin grant (when validUntil supplied). */
export function overridePlanValidUntil(id: string, validUntil: number): void {
  db.prepare('UPDATE users SET plan_valid_until = ?, updated_at = ? WHERE id = ?').run(validUntil, now(), id);
}

export type { Locale };
