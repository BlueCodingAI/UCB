import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';

export interface BannerRow {
  id: string;
  name: string;
  image_path: string;
  image_alt: string | null;
  target_url: string | null;
  placement: string;
  target_language: string | null;
  target_plan: string | null;
  is_active: number;
  starts_at: number | null;
  ends_at: number | null;
  priority: number;
  impression_count: number;
  click_count: number;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface AdminBannerDTO {
  id: string;
  name: string;
  imagePath: string;
  imageUrl: string;
  imageAlt: string | null;
  targetUrl: string | null;
  placement: string;
  targetLanguage: string | null;
  targetPlan: string | null;
  isActive: boolean;
  startsAt: number | null;
  endsAt: number | null;
  priority: number;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Build the public-servable URL for a stored banner image. */
export function imageUrlFor(imagePath: string): string {
  return `/uploads/${imagePath}`;
}

/** Click-through rate as a fraction (clicks / impressions), rounded to 4 dp. */
export function computeCtr(impressions: number, clicks: number): number {
  if (!impressions) return 0;
  return Math.round((clicks / impressions) * 10000) / 10000;
}

/** DB row → admin banner DTO (includes analytics + computed CTR). */
export function mapBanner(r: BannerRow): AdminBannerDTO {
  return {
    id: r.id,
    name: r.name,
    imagePath: r.image_path,
    imageUrl: imageUrlFor(r.image_path),
    imageAlt: r.image_alt ?? null,
    targetUrl: r.target_url ?? null,
    placement: r.placement,
    targetLanguage: r.target_language ?? null,
    targetPlan: r.target_plan ?? null,
    isActive: !!r.is_active,
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
    priority: r.priority,
    impressionCount: r.impression_count,
    clickCount: r.click_count,
    ctr: computeCtr(r.impression_count, r.click_count),
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getBannerRow(id: string): BannerRow | undefined {
  return db.prepare('SELECT * FROM banners WHERE id = ?').get(id) as BannerRow | undefined;
}

export interface CreateBannerInput {
  name: string;
  imagePath: string;
  imageAlt?: string | null;
  targetUrl?: string | null;
  placement: string;
  targetLanguage?: string | null;
  targetPlan?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  priority?: number;
  isActive?: boolean;
  createdBy?: string | null;
}

export function insertBanner(input: CreateBannerInput): BannerRow {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO banners
       (id, name, image_path, image_alt, target_url, placement, target_language, target_plan,
        is_active, starts_at, ends_at, priority, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.imagePath,
    input.imageAlt ?? null,
    input.targetUrl ?? null,
    input.placement,
    input.targetLanguage ?? null,
    input.targetPlan ?? null,
    input.isActive === false ? 0 : 1,
    input.startsAt ?? null,
    input.endsAt ?? null,
    input.priority ?? 0,
    input.createdBy ?? null,
    ts,
    ts,
  );
  return getBannerRow(id)!;
}

export interface UpdateBannerInput {
  name?: string;
  imagePath?: string;
  imageAlt?: string | null;
  targetUrl?: string | null;
  placement?: string;
  targetLanguage?: string | null;
  targetPlan?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  priority?: number;
  isActive?: boolean;
}

const UPDATE_COLUMNS: Record<keyof UpdateBannerInput, string> = {
  name: 'name',
  imagePath: 'image_path',
  imageAlt: 'image_alt',
  targetUrl: 'target_url',
  placement: 'placement',
  targetLanguage: 'target_language',
  targetPlan: 'target_plan',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  priority: 'priority',
  isActive: 'is_active',
};

/** Patch the supplied columns; returns the updated row. */
export function updateBanner(id: string, input: UpdateBannerInput): BannerRow {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of Object.keys(input) as (keyof UpdateBannerInput)[]) {
    const value = input[key];
    if (value === undefined) continue;
    sets.push(`${UPDATE_COLUMNS[key]} = ?`);
    if (key === 'isActive') params.push(value ? 1 : 0);
    else params.push(value);
  }
  if (sets.length) {
    sets.push('updated_at = ?');
    params.push(now());
    params.push(id);
    db.prepare(`UPDATE banners SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }
  return getBannerRow(id)!;
}

export function setBannerActive(id: string, active: boolean): BannerRow {
  db.prepare('UPDATE banners SET is_active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, now(), id);
  return getBannerRow(id)!;
}

export function deleteBanner(id: string): void {
  db.prepare('DELETE FROM banners WHERE id = ?').run(id);
}

export interface BannerStatsRow {
  statDate: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

/** Daily impression/click series for a banner from banner_stats_daily. */
export function bannerDailySeries(id: string): BannerStatsRow[] {
  const rows = db
    .prepare(
      `SELECT stat_date, impression_count, click_count
         FROM banner_stats_daily WHERE banner_id = ? ORDER BY stat_date ASC`,
    )
    .all(id) as { stat_date: string; impression_count: number; click_count: number }[];
  return rows.map((r) => ({
    statDate: r.stat_date,
    impressions: r.impression_count,
    clicks: r.click_count,
    ctr: computeCtr(r.impression_count, r.click_count),
  }));
}
