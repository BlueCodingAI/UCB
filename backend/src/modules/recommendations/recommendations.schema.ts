import { z } from 'zod';

/** GET /recommendations — optional status filter. */
export const listQuerySchema = z.object({
  status: z.enum(['pending', 'in_progress', 'done', 'dismissed', 'expired']).optional(),
});

/** POST /recommendations/steps/:stepId/status */
export const stepParamsSchema = z.object({
  stepId: z.string().min(1),
});

export const updateStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'done', 'dismissed']),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
export type UpdateStatusBody = z.infer<typeof updateStatusSchema>;
