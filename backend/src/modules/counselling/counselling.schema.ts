import { z } from 'zod';

const locale = z.enum(['en', 'hi', 'mr']);
const mode = z.enum(['call', 'video', 'chat', 'in_person']);

/** GET /slots — optional mode filter. */
export const listSlotsQuery = z.object({
  mode: mode.optional(),
});

/** POST /requests — create a counselling request. */
export const createRequestBody = z.object({
  type: z.enum(['assist', 'one_to_one', 'in_person', 'general_query']),
  topic: z.string().trim().min(1).max(200).optional(),
  message: z.string().trim().min(1).max(4000).optional(),
  preferredLanguage: locale,
  preferredMode: mode.optional(),
  preferredTimes: z.array(z.number().int().nonnegative()).max(20).optional(),
});

/** :id path param. */
export const idParam = z.object({
  id: z.string().trim().min(1),
});

/** POST /requests/:id/book — pick a slot. */
export const bookBody = z.object({
  slotId: z.string().trim().min(1),
});

export type ListSlotsQuery = z.infer<typeof listSlotsQuery>;
export type CreateRequestBody = z.infer<typeof createRequestBody>;
export type BookBody = z.infer<typeof bookBody>;
