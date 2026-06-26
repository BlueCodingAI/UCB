import { db } from '../../db/connection';
import { now, istDateKey } from '../../lib/time';
import { Errors } from '../../lib/errors';
import { effectivePlan } from '../../middleware/auth';
import type { PlanCode } from '../../types';

interface PlanLimitRow {
  daily_chat_limit: number | null;
}

interface UsageRow {
  voice_count: number;
}

export interface VoiceUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
}

/** Resolve the shared daily cap for a user's effective plan (null = unlimited). */
export function dailyVoiceLimit(userId: string): number | null {
  const plan: PlanCode = effectivePlan(userId);
  const row = db.prepare('SELECT daily_chat_limit FROM plans WHERE code = ?').get(plan) as
    | PlanLimitRow
    | undefined;
  return row?.daily_chat_limit ?? null;
}

/** Today's voice usage row count for the user. */
export function getVoiceUsage(userId: string): VoiceUsage {
  const limit = dailyVoiceLimit(userId);
  const row = db
    .prepare('SELECT voice_count FROM chat_usage_daily WHERE user_id = ? AND usage_date = ?')
    .get(userId, istDateKey()) as UsageRow | undefined;
  const used = row?.voice_count ?? 0;
  return { used, limit, remaining: limit == null ? null : Math.max(0, limit - used) };
}

/**
 * Enforce the daily voice cap (shared with chat via plans.daily_chat_limit).
 * Throws a rate_limited AppError when the limit is reached. Null limit = unlimited.
 */
export function assertVoiceQuota(userId: string): void {
  const { used, limit } = getVoiceUsage(userId);
  if (limit != null && used >= limit) {
    throw Errors.rateLimited('You have reached your daily voice limit. Upgrade your plan for more.');
  }
}

/** Increment today's voice_count for the user (upsert). */
export function incrementVoiceUsage(userId: string): void {
  const ts = now();
  db.prepare(
    `INSERT INTO chat_usage_daily (user_id, usage_date, chat_count, voice_count, updated_at)
     VALUES (?, ?, 0, 1, ?)
     ON CONFLICT(user_id, usage_date)
     DO UPDATE SET voice_count = voice_count + 1, updated_at = excluded.updated_at`,
  ).run(userId, istDateKey(ts), ts);
}
