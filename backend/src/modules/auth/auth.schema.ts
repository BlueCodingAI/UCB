import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('A valid email is required');
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);
const mobile = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{6,20}$/, 'A valid mobile number is required');
const locale = z.enum(['en', 'hi', 'mr']);

export const registerSchema = {
  body: z
    .object({
      email,
      password,
      fullName: z.string().trim().min(1).max(120).optional(),
      mobile: mobile.optional(),
      preferredLanguage: locale.optional(),
    })
    .strip(),
};

export const loginSchema = {
  body: z
    .object({
      email,
      password: z.string().min(1, 'Password is required').max(200),
    })
    .strict(),
};

export const otpRequestSchema = {
  body: z
    .object({
      channel: z.enum(['email', 'sms', 'whatsapp']).default('email'),
      email: email.optional(),
      mobile: mobile.optional(),
      purpose: z.enum(['login', 'signup', 'verify_email', 'verify_mobile']).default('login'),
    })
    .strict()
    .refine((v) => !!v.email || !!v.mobile, {
      message: 'Either email or mobile is required',
      path: ['email'],
    }),
};

export const otpVerifySchema = {
  body: z
    .object({
      otpId: z.string().min(1),
      code: z
        .string()
        .trim()
        .regex(/^[0-9]{4,8}$/, 'Invalid code'),
      preferredLanguage: locale.optional(),
    })
    .strict(),
};

export const passwordForgotSchema = {
  body: z.object({ email }).strict(),
};

export const passwordResetSchema = {
  body: z
    .object({
      token: z.string().min(1),
      newPassword: password,
    })
    .strict(),
};

export const emailVerifySchema = {
  body: z.object({ token: z.string().min(1) }).strict(),
};

export const refreshSchema = {
  body: z.object({ refreshToken: z.string().min(1).optional() }).strip(),
};

export const adminLoginSchema = {
  body: z
    .object({
      email,
      password: z.string().min(1, 'Password is required').max(200),
    })
    .strict(),
};
