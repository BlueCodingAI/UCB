import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../../db/connection';
import { ok, created, noContent } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { parseOffset, offsetMeta } from '../../lib/paginate';
import { writeAudit } from '../../middleware/audit';
import {
  mapBanner,
  getBannerRow,
  insertBanner,
  updateBanner,
  setBannerActive,
  deleteBanner,
  bannerDailySeries,
  computeCtr,
  type BannerRow,
} from './adminBanners.service';
import type { CreateBannerInput, UpdateBannerInput } from './adminBanners.schema';

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

const SORT_COLUMNS: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  priority: 'priority',
  name: 'name',
  impressions: 'impression_count',
  clicks: 'click_count',
};

/** POST / — create a banner (image required via imageUpload.single('image')). */
export const createBanner = asyncHandler(async (req, res) => {
  if (!req.file) throw Errors.validation('An image file is required', [{ field: 'image', issue: 'required' }]);
  const input = req.body as CreateBannerInput;

  const row = insertBanner({
    name: input.name,
    imagePath: req.file.filename,
    imageAlt: input.imageAlt ?? null,
    targetUrl: input.targetUrl ?? null,
    placement: input.placement,
    targetLanguage: input.targetLanguage ?? null,
    targetPlan: input.targetPlan ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    priority: input.priority,
    isActive: input.isActive,
    createdBy: req.auth?.sub ?? null,
  });

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'banner.create',
    entityType: 'banner',
    entityId: row.id,
    after: { name: row.name, placement: row.placement },
    req,
  });

  created(res, mapBanner(row));
});

/** GET / — paginated list of all banners with computed CTR. */
export const listBanners = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, sort, order, q, filters } = parseOffset(req, { sort: 'createdAt' });
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.placement) {
    where.push('placement = ?');
    params.push(filters.placement);
  }
  if (filters.isActive === 'true' || filters.isActive === '1') {
    where.push('is_active = 1');
  } else if (filters.isActive === 'false' || filters.isActive === '0') {
    where.push('is_active = 0');
  }
  if (q) {
    where.push('name LIKE ?');
    params.push(`%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = SORT_COLUMNS[sort] ?? 'created_at';

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM banners ${whereSql}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM banners ${whereSql} ORDER BY ${sortCol} ${order.toUpperCase()} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset) as BannerRow[];

  ok(res, rows.map(mapBanner), { pagination: offsetMeta(page, pageSize, total) });
});

/** PUT /:id — update banner config; optional new image replaces image_path. */
export const updateBannerCtrl = asyncHandler(async (req, res) => {
  const before = getBannerRow(req.params.id);
  if (!before) throw Errors.notFound('Banner not found');
  const input = req.body as UpdateBannerInput;

  const patch: Parameters<typeof updateBanner>[1] = {
    name: input.name,
    imageAlt: input.imageAlt,
    targetUrl: input.targetUrl,
    placement: input.placement,
    targetLanguage: input.targetLanguage,
    targetPlan: input.targetPlan,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    priority: input.priority,
    isActive: input.isActive,
  };
  if (req.file) patch.imagePath = req.file.filename;

  const row = updateBanner(req.params.id, patch);

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'banner.update',
    entityType: 'banner',
    entityId: row.id,
    before: { name: before.name, placement: before.placement, isActive: !!before.is_active },
    after: { name: row.name, placement: row.placement, isActive: !!row.is_active },
    req,
  });

  ok(res, mapBanner(row));
});

/** PATCH /:id/active — toggle active state. */
export const toggleBannerActive = asyncHandler(async (req, res) => {
  const before = getBannerRow(req.params.id);
  if (!before) throw Errors.notFound('Banner not found');
  const active = (req.body as { isActive: boolean }).isActive;

  const row = setBannerActive(req.params.id, active);

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'banner.toggle_active',
    entityType: 'banner',
    entityId: row.id,
    before: { isActive: !!before.is_active },
    after: { isActive: !!row.is_active },
    req,
  });

  ok(res, mapBanner(row));
});

/** DELETE /:id — hard delete banner (cascades events/stats). */
export const deleteBannerCtrl = asyncHandler(async (req, res) => {
  const before = getBannerRow(req.params.id);
  if (!before) throw Errors.notFound('Banner not found');

  deleteBanner(req.params.id);

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'banner.delete',
    entityType: 'banner',
    entityId: before.id,
    before: { name: before.name, placement: before.placement },
    req,
  });

  noContent(res);
});

/** GET /:id/analytics — impression/click totals + daily series + CTR. */
export const bannerAnalytics = asyncHandler(async (req, res) => {
  const row = getBannerRow(req.params.id);
  if (!row) throw Errors.notFound('Banner not found');

  const series = bannerDailySeries(req.params.id);

  ok(res, {
    bannerId: row.id,
    name: row.name,
    placement: row.placement,
    totals: {
      impressions: row.impression_count,
      clicks: row.click_count,
      ctr: computeCtr(row.impression_count, row.click_count),
    },
    daily: series,
  });
});
