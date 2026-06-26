import type { Request, Response } from 'express';
import { ok, noContent } from '../../lib/response';
import { listActiveBanners, trackEvent } from './banners.service';
import type { Locale } from '../../types';
import type { ServeQuery, TrackBody } from './banners.schema';

/** GET /banners?placement=&lang= — public active banners for a placement. */
export function serve(req: Request, res: Response): void {
  const { placement, lang } = req.query as unknown as ServeQuery;
  const banners = listActiveBanners(placement, lang as Locale | undefined);
  ok(res, banners);
}

/** POST /banners/:id/impression — best-effort, always 204. */
export function recordImpression(req: Request, res: Response): void {
  const body = req.body as TrackBody;
  trackEvent('impression', {
    bannerId: req.params.id,
    userId: req.auth?.sub ?? null,
    sessionRef: body.sessionRef ?? null,
    placement: body.placement ?? null,
    pageUrl: body.pageUrl ?? null,
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
  });
  noContent(res);
}

/** POST /banners/:id/click — best-effort, always 204. */
export function recordClick(req: Request, res: Response): void {
  const body = req.body as TrackBody;
  trackEvent('click', {
    bannerId: req.params.id,
    userId: req.auth?.sub ?? null,
    sessionRef: body.sessionRef ?? null,
    placement: body.placement ?? null,
    pageUrl: body.pageUrl ?? null,
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
  });
  noContent(res);
}
