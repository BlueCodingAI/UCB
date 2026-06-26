import { z } from 'zod';

const PLACEMENTS = [
  'home_top',
  'home_mid',
  'sidebar',
  'chat_footer',
  'pricing',
  'dashboard',
  'popup',
] as const;

/** GET /banners?placement=&lang= */
export const serveQuery = z.object({
  placement: z.enum(PLACEMENTS),
  lang: z.enum(['en', 'hi', 'mr']).optional(),
});

/** Path param for impression/click. */
export const idParams = z.object({
  id: z.string().min(1),
});

/** Body for impression/click — all optional, lightweight tracking. */
export const trackBody = z
  .object({
    sessionRef: z.string().trim().max(128).optional(),
    placement: z.enum(PLACEMENTS).optional(),
    pageUrl: z.string().trim().max(1024).optional(),
  })
  .partial();

export type ServeQuery = z.infer<typeof serveQuery>;
export type TrackBody = z.infer<typeof trackBody>;
