import { z } from 'zod';

const MODES = ['call', 'video', 'chat', 'in_person'] as const;
const REQUEST_STATUSES = ['new', 'contacted', 'scheduled', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export const idParams = z.object({ id: z.string().min(1) });

// ---- requests ----
export const listRequestsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  q: z.string().optional(),
  'filter[status]': z.enum(REQUEST_STATUSES).optional(),
  'filter[priority]': z.enum(PRIORITIES).optional(),
  'filter[assignedTo]': z.string().optional(),
});

export const updateRequestBody = z
  .object({
    status: z.enum(REQUEST_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assignedTo: z.string().min(1).nullable().optional(),
    resolutionNotes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const addNoteBody = z.object({
  note: z.string().trim().min(1).max(5000),
  notifyUser: z.boolean().optional(),
  notificationTitle: z.string().trim().max(200).optional(),
  notificationBody: z.string().trim().max(2000).optional(),
});

// ---- slots ----
export const createSlotBody = z
  .object({
    counsellorId: z.string().min(1).optional(),
    mode: z.enum(MODES).default('call'),
    startAt: z.number().int().positive(),
    endAt: z.number().int().positive().nullable().optional(),
    location: z.string().trim().max(500).nullable().optional(),
    meetingLink: z.string().trim().url().max(1000).nullable().optional(),
    capacity: z.number().int().min(1).max(1000).optional(),
  })
  .refine((v) => v.endAt == null || v.endAt > v.startAt, {
    message: 'endAt must be after startAt',
    path: ['endAt'],
  });

export const listSlotsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

// ---- appointments ----
export const listAppointmentsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  'filter[counsellor]': z.string().optional(),
  'filter[status]': z.string().optional(),
});

export type UpdateRequestInput = z.infer<typeof updateRequestBody>;
export type AddNoteInput = z.infer<typeof addNoteBody>;
export type CreateSlotInput = z.infer<typeof createSlotBody>;
