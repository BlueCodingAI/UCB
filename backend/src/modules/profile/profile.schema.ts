import { z } from 'zod';
import { CAP_STAGES } from '../../types';

const localeEnum = z.enum(['en', 'hi', 'mr']);

const trimmedOptionalString = (max = 200) =>
  z.string().trim().max(max).optional();

const nullableTrimmedString = (max = 200) =>
  z.string().trim().max(max).nullish().transform((v) => (v == null || v === '' ? null : v));

/** PUT /profile — account basics update. All fields optional (partial update). */
export const updateProfileBody = z
  .object({
    fullName: nullableTrimmedString(200),
    preferredLanguage: localeEnum.optional(),
    locationCity: nullableTrimmedString(120),
    locationDistrict: nullableTrimmedString(120),
    notifyInApp: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    notifyWhatsapp: z.boolean().optional(),
    notifySms: z.boolean().optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileBody>;

const documentsStatusSchema = z.record(z.string(), z.unknown());

/** PUT /profile/cap — upsert CAP profile memory. All fields optional. */
export const updateCapProfileBody = z
  .object({
    category: nullableTrimmedString(60),
    courseInterest: nullableTrimmedString(120),
    cetExam: nullableTrimmedString(60),
    cetScore: z.number().finite().nullish().transform((v) => (v == null ? null : v)),
    cetPercentile: z.number().finite().min(0).max(100).nullish().transform((v) => (v == null ? null : v)),
    meritNumber: z.number().int().nonnegative().nullish().transform((v) => (v == null ? null : v)),
    capYear: z.number().int().min(2000).max(2100).nullish().transform((v) => (v == null ? null : v)),
    capApplicationNo: nullableTrimmedString(60),
    homeUniversity: nullableTrimmedString(160),
    preferredDistricts: z.array(z.string().trim().max(120)).max(100).optional(),
    preferredColleges: z.array(z.string().trim().max(200)).max(200).optional(),
    documentsStatus: documentsStatusSchema.optional(),
    currentStage: z.enum(CAP_STAGES).nullish().transform((v) => (v == null ? null : v)),
  })
  .strict();

export type UpdateCapProfileInput = z.infer<typeof updateCapProfileBody>;
