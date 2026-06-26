import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now, istDateKey } from '../../lib/time';
import type { BannerDTO, Locale } from '../../types';

interface BannerRow {
  id: string;
  name: string;
  image_path: string;
  image_alt: string | null;
  target_url: string | null;
  placement: string;
}

/** Map a snake_case banners row to the public BannerDTO. */
function mapBanner(row: BannerRow): BannerDTO {
  return {
    id: row.id,
    name: row.name,
    // Stored path/filename; the frontend prefixes /uploads/.
    imageUrl: row.image_path,
    imageAlt: row.image_alt,
    targetUrl: row.target_url,
    placement: row.placement,
  };
}

/**
 * Active banners for a placement, respecting the live serve window and
 * language targeting. Ordered by priority desc.
 */
export function listActiveBanners(placement: string, lang?: Locale): BannerDTO[] {
  const ts = now();
  const rows = db
    .prepare(
      `SELECT id, name, image_path, image_alt, target_url, placement
         FROM banners
        WHERE placement = ?
          AND is_active = 1
          AND (starts_at IS NULL OR starts_at <= ?)
          AND (ends_at   IS NULL OR ends_at   >= ?)
          AND (target_language IS NULL OR target_language = 'all' OR target_language = ?)
        ORDER BY priority DESC, created_at DESC`,
    )
    .all(placement, ts, ts, lang ?? null) as BannerRow[];
  return rows.map(mapBanner);
}

interface TrackInput {
  bannerId: string;
  userId?: string | null;
  sessionRef?: string | null;
  placement?: string | null;
  pageUrl?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const incrementImpression = db.prepare(
  'UPDATE banners SET impression_count = impression_count + 1, updated_at = ? WHERE id = ?',
);
const incrementClick = db.prepare(
  'UPDATE banners SET click_count = click_count + 1, updated_at = ? WHERE id = ?',
);
const insertEvent = db.prepare(
  `INSERT INTO banner_events
     (id, banner_id, event_type, user_id, session_ref, placement, page_url, ip_address, user_agent, created_at)
   VALUES (@id, @banner_id, @event_type, @user_id, @session_ref, @placement, @page_url, @ip_address, @user_agent, @created_at)`,
);
const upsertImpressionStat = db.prepare(
  `INSERT INTO banner_stats_daily (banner_id, stat_date, impression_count, click_count)
     VALUES (?, ?, 1, 0)
   ON CONFLICT(banner_id, stat_date) DO UPDATE SET impression_count = impression_count + 1`,
);
const upsertClickStat = db.prepare(
  `INSERT INTO banner_stats_daily (banner_id, stat_date, impression_count, click_count)
     VALUES (?, ?, 0, 1)
   ON CONFLICT(banner_id, stat_date) DO UPDATE SET click_count = click_count + 1`,
);

/**
 * Record a banner event ('impression' or 'click'), increment the matching
 * counter and upsert the daily stat. Lightweight; never throws on a bad/unknown
 * banner id — if the FK fails we simply swallow it (anonymous tracking endpoint).
 */
export function trackEvent(eventType: 'impression' | 'click', input: TrackInput): void {
  const ts = now();
  try {
    const tx = db.transaction(() => {
      insertEvent.run({
        id: newId(),
        banner_id: input.bannerId,
        event_type: eventType,
        user_id: input.userId ?? null,
        session_ref: input.sessionRef ?? null,
        placement: input.placement ?? null,
        page_url: input.pageUrl ?? null,
        ip_address: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        created_at: ts,
      });
      const dateKey = istDateKey(ts);
      if (eventType === 'impression') {
        incrementImpression.run(ts, input.bannerId);
        upsertImpressionStat.run(input.bannerId, dateKey);
      } else {
        incrementClick.run(ts, input.bannerId);
        upsertClickStat.run(input.bannerId, dateKey);
      }
    });
    tx();
  } catch {
    /* unknown banner id / FK violation — ignore, tracking is best-effort */
  }
}
