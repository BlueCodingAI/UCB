import { z } from 'zod';

const planCodeEnum = z.enum(['freemium', 'premium', 'super_premium']);

/** GET /admin/users — list query: offset paginate + filters. */
export const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  q: z.string().trim().optional(),
  'filter[plan]': z.enum(['freemium', 'premium', 'super_premium']).optional(),
  'filter[status]': z.enum(['active', 'suspended', 'deleted']).optional(),
  'filter[language]': z.enum(['en', 'hi', 'mr']).optional(),
});

export const userIdParams = z.object({ id: z.string().min(1) });

/** PATCH /admin/users/:id — partial update of editable user fields. */
export const updateUserBody = z
  .object({
    status: z.enum(['active', 'suspended']).optional(),
    fullName: z.string().trim().min(1).max(160).nullable().optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
    mobile: z.string().trim().min(4).max(20).nullable().optional(),
    preferredLanguage: z.enum(['en', 'hi', 'mr']).optional(),
    locationCity: z.string().trim().max(120).nullable().optional(),
    locationDistrict: z.string().trim().max(120).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

/** POST /admin/users/:id/plan — admin grant of a plan. */
export const grantPlanBody = z.object({
  planCode: planCodeEnum,
  validUntil: z.coerce.number().int().positive().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;
export type GrantPlanBody = z.infer<typeof grantPlanBody>;
