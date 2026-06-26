export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Current time as unix epoch milliseconds (UTC). */
export function now(): number {
  return Date.now();
}

/** Convert epoch ms to ISO-8601 string (UTC). */
export function toISO(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/** 'YYYY-MM-DD' in IST (Asia/Kolkata, UTC+5:30) — used for daily usage keys. */
export function istDateKey(ms: number = now()): string {
  const ist = new Date(ms + 5.5 * HOUR);
  return ist.toISOString().slice(0, 10);
}

/** Parse an ISO date string to epoch ms, or null. */
export function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}
