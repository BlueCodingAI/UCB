import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const createBroadcastBody = z
  .object({
    title: trimmed(200),
    bodyEn: z.string().trim().max(5000).optional(),
    bodyHi: z.string().trim().max(5000).optional(),
    bodyMr: z.string().trim().max(5000).optional(),
    defaultLanguage: z.enum(['en', 'hi', 'mr']).default('en'),
    audienceType: z.enum(['all', 'plan', 'language', 'location', 'custom']).default('all'),
    audienceFilter: z.record(z.unknown()).default({}),
    channels: z.array(z.enum(['in_app', 'email', 'sms', 'whatsapp'])).min(1).default(['in_app']),
    scheduledAt: z.number().int().positive().nullable().optional(),
    sendNow: z.boolean().optional(),
  })
  .refine((v) => v.bodyEn || v.bodyHi || v.bodyMr, {
    message: 'At least one localized body (bodyEn/bodyHi/bodyMr) is required',
    path: ['bodyEn'],
  });

export const broadcastIdParams = z.object({ id: z.string().min(1) });

export const listBroadcastsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  q: z.string().optional(),
  'filter[status]': z.string().optional(),
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastBody>;
