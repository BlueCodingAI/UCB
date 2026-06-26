import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../../db/connection';
import { ok, created, noContent } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { env } from '../../config/env';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import { mapUser } from '../../lib/mappers';
import { sendMail } from '../../services/email';
import { logger } from '../../lib/logger';
import { writeAudit } from '../../middleware/audit';
import type { Locale } from '../../types';
import {
  findUserById,
  findUserByEmail,
  findUserByMobile,
  issueUserTokens,
  rotateRefresh,
  revokeRefresh,
  revokeAllSessions,
  touchLastLogin,
  createOtp,
  verifyOtp,
  createResetToken,
  createEmailVerifyToken,
  consumeTokenByPurpose,
  type UserRow,
} from './auth.service';

const REFRESH_COOKIE = 'ucb_rt';

/** Wrap an async controller so thrown errors flow to the central handler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: env.cookieSecure,
    signed: true,
    maxAge: env.refreshTokenTtlSec * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: env.cookieSecure,
    signed: true,
  });
}

/** Read the presented refresh token from the signed cookie or request body. */
function presentedRefreshToken(req: Request): string | null {
  const fromCookie = req.signedCookies?.[REFRESH_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof fromBody === 'string' && fromBody ? fromBody : null;
}

// ---- POST /auth/register ----------------------------------------------------

export const register = asyncHandler(async (req, res) => {
  const { email, password, fullName, preferredLanguage } = req.body as {
    email: string;
    password: string;
    fullName?: string;
    preferredLanguage?: Locale;
  };

  if (findUserByEmail(email)) throw Errors.conflict('An account with this email already exists');

  const id = newId();
  const ts = now();
  const passwordHash = await hashPassword(password);
  db.prepare(
    `INSERT INTO users (id, full_name, email, password_hash, email_verified, preferred_language, current_plan_code, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, 'freemium', 'active', ?, ?)`,
  ).run(id, fullName ?? null, email, passwordHash, preferredLanguage ?? 'en', ts, ts);

  const user = findUserById(id)!;
  const token = createEmailVerifyToken(user);
  await sendMail({
    to: email,
    subject: 'Verify your Disha account',
    html: `<p>Welcome to Disha. Confirm your email to get started.</p><p>Verification token: <b>${token}</b></p>`,
    text: `Welcome to Disha. Verify your email with this token: ${token}`,
  });

  writeAudit({ actorType: 'user', actorId: id, action: 'auth.register', entityType: 'user', entityId: id, req });

  created(res, { userId: id, emailVerificationSent: true });
});

// ---- POST /auth/login -------------------------------------------------------

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = findUserByEmail(email);
  if (!user || user.status !== 'active') throw Errors.unauthenticated('Invalid email or password');

  const okPass = await verifyPassword(password, user.password_hash);
  if (!okPass) throw Errors.unauthenticated('Invalid email or password');

  const tokens = issueUserTokens(user, req);
  touchLastLogin(user.id);
  setRefreshCookie(res, tokens.refreshToken);

  ok(res, { user: mapUser(user), ...tokens });
});

// ---- POST /auth/otp/request -------------------------------------------------

export const otpRequest = asyncHandler(async (req, res) => {
  const { channel, email, mobile, purpose } = req.body as {
    channel: 'email' | 'sms' | 'whatsapp';
    email?: string;
    mobile?: string;
    purpose: 'login' | 'signup' | 'verify_email' | 'verify_mobile';
  };

  const destination = channel === 'email' ? email : mobile;
  if (!destination) throw Errors.validation('A destination matching the channel is required');

  const existing = channel === 'email' ? findUserByEmail(destination) : findUserByMobile(destination);

  const otp = createOtp({ channel, destination, purpose, userId: existing?.id ?? null, req });

  if (channel === 'email') {
    await sendMail({
      to: destination,
      subject: 'Your Disha verification code',
      html: `<p>Your verification code is <b>${otp.code}</b>. It expires in 5 minutes.</p>`,
      text: `Your Disha verification code is ${otp.code}. It expires in 5 minutes.`,
    });
  } else {
    // SMS/WhatsApp not wired in dev — log so the flow is testable.
    logger.info({ channel, destination, code: otp.code }, '[otp:console] (SMS/WhatsApp not configured)');
  }

  ok(res, { otpId: otp.otpId, expiresInSec: otp.expiresInSec, resendInSec: otp.resendInSec });
});

// ---- POST /auth/otp/verify --------------------------------------------------

export const otpVerify = asyncHandler(async (req, res) => {
  const { otpId, code, preferredLanguage } = req.body as {
    otpId: string;
    code: string;
    preferredLanguage?: Locale;
  };

  const row = verifyOtp(otpId, code);

  let user: UserRow | undefined;
  let isNewUser = false;

  if (row.user_id) {
    user = findUserById(row.user_id);
  }
  if (!user) {
    user =
      row.channel === 'email' ? findUserByEmail(row.destination) : findUserByMobile(row.destination);
  }

  if (!user) {
    // Create-on-verify: passwordless signup via OTP.
    const id = newId();
    const ts = now();
    const emailVerified = row.channel === 'email' ? 1 : 0;
    const mobileVerified = row.channel === 'email' ? 0 : 1;
    db.prepare(
      `INSERT INTO users (id, email, mobile, email_verified, mobile_verified, preferred_language, current_plan_code, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'freemium', 'active', ?, ?)`,
    ).run(
      id,
      row.channel === 'email' ? row.destination : null,
      row.channel === 'email' ? null : row.destination,
      emailVerified,
      mobileVerified,
      preferredLanguage ?? 'en',
      ts,
      ts,
    );
    user = findUserById(id)!;
    isNewUser = true;
  } else {
    // Mark the verified channel.
    if (row.channel === 'email') {
      db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(now(), user.id);
    } else {
      db.prepare('UPDATE users SET mobile_verified = 1, updated_at = ? WHERE id = ?').run(now(), user.id);
    }
    user = findUserById(user.id)!;
  }

  if (user.status !== 'active') throw Errors.forbidden('This account is not active');

  const tokens = issueUserTokens(user, req);
  touchLastLogin(user.id);
  setRefreshCookie(res, tokens.refreshToken);

  ok(res, { user: mapUser(user), ...tokens, isNewUser });
});

// ---- POST /auth/refresh -----------------------------------------------------

export const refresh = asyncHandler(async (req, res) => {
  const token = presentedRefreshToken(req);
  if (!token) throw Errors.unauthenticated('No refresh token provided');

  const tokens = rotateRefresh(token, req);
  setRefreshCookie(res, tokens.refreshToken);

  ok(res, tokens);
});

// ---- POST /auth/logout ------------------------------------------------------

export const logout = asyncHandler(async (req, res) => {
  const token = presentedRefreshToken(req);
  if (token) revokeRefresh(token);
  clearRefreshCookie(res);
  noContent(res);
});

// ---- POST /auth/logout-all --------------------------------------------------

export const logoutAll = asyncHandler(async (req, res) => {
  revokeAllSessions(req.auth!.sub);
  clearRefreshCookie(res);
  noContent(res);
});

// ---- POST /auth/password/forgot ---------------------------------------------

export const passwordForgot = asyncHandler(async (req, res) => {
  const { email } = req.body as { email: string };
  const user = findUserByEmail(email);
  if (user) {
    const token = createResetToken(user);
    await sendMail({
      to: email,
      subject: 'Reset your Disha password',
      html: `<p>We received a request to reset your password.</p><p>Reset token: <b>${token}</b> (valid 30 minutes). If you did not request this, ignore this email.</p>`,
      text: `Reset your Disha password with this token: ${token} (valid 30 minutes).`,
    });
  }
  // Always 200 to avoid leaking which emails are registered.
  ok(res, { sent: true });
});

// ---- POST /auth/password/reset ----------------------------------------------

export const passwordReset = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  const { userId } = consumeTokenByPurpose(token, 'reset_password');

  const passwordHash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now(), userId);

  // Invalidate all existing sessions after a password change.
  revokeAllSessions(userId);
  writeAudit({ actorType: 'user', actorId: userId, action: 'auth.password_reset', entityType: 'user', entityId: userId, req });

  ok(res, { reset: true });
});

// ---- POST /auth/email/verify ------------------------------------------------

export const emailVerify = asyncHandler(async (req, res) => {
  const { token } = req.body as { token: string };
  const { userId } = consumeTokenByPurpose(token, 'verify_email');
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(now(), userId);
  ok(res, { verified: true });
});

// ---- GET /auth/me -----------------------------------------------------------

export const me = asyncHandler(async (req, res) => {
  const user = findUserById(req.auth!.sub);
  if (!user) throw Errors.notFound('User not found');
  ok(res, { user: mapUser(user) });
});
