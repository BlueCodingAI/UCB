import type { Locale } from './types';

/** Format integer paise as INR currency, e.g. 9900 → "₹99". */
export function formatPaise(paise: number, opts: { withDecimals?: boolean } = {}): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: opts.withDecimals && rupees % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: opts.withDecimals ? 2 : 0,
  }).format(rupees);
}

const LOCALE_TAG: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

/** Format an epoch-ms timestamp as a readable date. */
export function formatDate(ms: number | null | undefined, locale: Locale = 'en'): string {
  if (ms == null) return '—';
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(ms),
  );
}

export function formatDateTime(ms: number | null | undefined, locale: Locale = 'en'): string {
  if (ms == null) return '—';
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

/** Relative time like "2h ago" / "in 3d". */
export function formatRelative(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const min = 60_000, hour = 3_600_000, day = 86_400_000;
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
  return rtf.format(Math.round(diff / day), 'day');
}

export function initials(name: string | null | undefined): string {
  if (!name) return 'U';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
