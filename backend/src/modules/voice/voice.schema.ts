import { z } from 'zod';

const language = z.enum(['en', 'hi', 'mr']);

/** STT / ask: language carried as a multipart form field (string). */
export const voiceLangBody = z.object({
  language: language.default('en'),
});

/** TTS: JSON body with text + language. */
export const ttsBody = z.object({
  text: z.string().trim().min(1, 'text is required').max(5000),
  language: language.default('en'),
});

export type VoiceLangBody = z.infer<typeof voiceLangBody>;
export type TtsBody = z.infer<typeof ttsBody>;
