import { z } from 'zod';

const localeEnum = z.enum(['en', 'hi', 'mr', 'mixed']);
const sourceTypeEnum = z.enum([
  'pdf',
  'google_sheet',
  'faq',
  'notice',
  'circular',
  'schedule',
  'counselling_note',
  'manual_text',
  'url',
]);

const trimmed = z.string().trim();
const optionalTrimmed = trimmed.min(1).optional();

/**
 * Multipart/form-data sends every field as a string. Coerce booleans/years from
 * their string forms; on a JSON request zod still accepts the native types.
 */
const boolCoerce = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const yearCoerce = z.coerce.number().int().min(2000).max(2100);

export const createDocumentSchema = z
  .preprocess((raw) => {
    const body = raw as Record<string, unknown>;
    if (body && typeof body.url === 'string' && body.url.trim() && !body.sourceUrl) {
      return { ...body, sourceUrl: body.url };
    }
    return body;
  }, z.object({
  title: trimmed.min(1).max(300),
  description: z.string().trim().max(20000).optional(),
  sourceType: sourceTypeEnum,
  language: localeEnum.default('en'),
  course: optionalTrimmed,
  capYear: yearCoerce.optional(),
  topic: optionalTrimmed,
  sourceUrl: trimmed.url().max(2000).optional(),
  content: z.string().trim().max(2_000_000).optional(),
  isActive: boolCoerce.optional(),
}))
  .refine(
    (d) => d.sourceType !== 'google_sheet' || !!d.sourceUrl?.trim(),
    { message: 'sourceUrl is required for Google Sheets', path: ['sourceUrl'] },
  );

export const updateDocumentSchema = z
  .object({
    title: trimmed.min(1).max(300).optional(),
    description: z.string().trim().max(20000).nullable().optional(),
    language: localeEnum.optional(),
    course: trimmed.max(120).nullable().optional(),
    capYear: yearCoerce.nullable().optional(),
    topic: trimmed.max(160).nullable().optional(),
    sourceUrl: trimmed.url().max(2000).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

export const toggleActiveSchema = z.object({
  isActive: boolCoerce,
});

export const searchTestSchema = z.object({
  query: trimmed.min(1).max(2000),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});
