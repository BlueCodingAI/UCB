import { z } from 'zod';

export const NOTIFICATION_TYPES = [
  'reminder',
  'recommendation',
  'counselling',
  'payment',
  'system',
  'broadcast',
  'deadline',
] as const;

/** GET / — cursor feed with optional type filter. */
export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

/** POST /:id/read */
export const idParam = z.object({
  id: z.string().trim().min(1),
});

/** PUT /preferences */
export const updatePreferences = z
  .object({
    notifyInApp: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    notifyWhatsapp: z.boolean().optional(),
    notifySms: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one preference is required' });

export type UpdatePreferencesInput = z.infer<typeof updatePreferences>;
