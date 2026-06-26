import { z } from 'zod';

const locale = z.enum(['en', 'hi', 'mr']);

/** POST /chat/sessions */
export const createSessionSchema = z.object({
  language: locale.optional(),
  channel: z.enum(['chat', 'voice']).optional(),
});

/** :id / :msgId path params */
export const sessionIdParams = z.object({
  id: z.string().min(1),
});

export const messageIdParams = z.object({
  msgId: z.string().min(1),
});

/** POST /chat/sessions/:id/messages (and /stream).
 *  language is optional — the server auto-detects the question's language. */
export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  language: locale.optional(),
  inputMode: z.enum(['text', 'voice']).optional(),
});

/** PATCH /chat/sessions/:id */
export const renameSessionSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

/** POST /chat/messages/:msgId/feedback */
export const feedbackSchema = z.object({
  helpful: z.boolean(),
});

/** GET /chat/sessions/:id/messages */
export const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type RenameSessionInput = z.infer<typeof renameSessionSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
