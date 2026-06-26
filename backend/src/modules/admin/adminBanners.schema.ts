import { z } from 'zod';

const PLACEMENTS = ['home_top', 'home_mid', 'sidebar', 'chat_footer', 'pricing', 'dashboard', 'popup'] as const;

// Multipart text fields arrive as strings; coerce numbers/booleans defensively.
const optionalEpoch = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : (v as number)));

const optionalBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1';
  });

export const createBannerBody = z.object({
  name: z.string().trim().min(1).max(200),
  imageAlt: z.string().trim().max(300).optional(),
  targetUrl: z.string().trim().url().max(1000).optional(),
  placement: z.enum(PLACEMENTS),
  targetLanguage: z.enum(['en', 'hi', 'mr', 'all']).optional(),
  targetPlan: z.enum(['freemium', 'premium', 'super_premium']).optional(),
  startsAt: optionalEpoch,
  endsAt: optionalEpoch,
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: optionalBool,
});

export const updateBannerBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  imageAlt: z.string().trim().max(300).optional(),
  targetUrl: z.string().trim().url().max(1000).optional(),
  placement: z.enum(PLACEMENTS).optional(),
  targetLanguage: z.enum(['en', 'hi', 'mr', 'all']).optional(),
  targetPlan: z.enum(['freemium', 'premium', 'super_premium']).optional(),
  startsAt: optionalEpoch,
  endsAt: optionalEpoch,
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: optionalBool,
});

export const toggleActiveBody = z.object({
  isActive: z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform((v) => {
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1';
  }),
});

export const bannerIdParams = z.object({ id: z.string().min(1) });

export const listBannersQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  q: z.string().optional(),
  'filter[placement]': z.string().optional(),
  'filter[isActive]': z.string().optional(),
});

export type CreateBannerInput = z.infer<typeof createBannerBody>;
export type UpdateBannerInput = z.infer<typeof updateBannerBody>;
