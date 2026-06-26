import type { Request } from 'express';
import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now, MINUTE } from '../../lib/time';
import { env } from '../../config/env';
import { Errors } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { randomToken, hashToken, generateOtp, hashOtp } from '../../lib/crypto';
import { effectivePlan } from '../../middleware/auth';
import type { Locale, PlanCode } from '../../types';

export interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  password_hash: string | null;
  email_verified: number;
  mobile_verified: number;
  preferred_language: Locale;
  location_city: string | null;
  location_district: string | null;
  current_plan_code: PlanCode;
  plan_valid_until: number | null;
  status: 'active' | 'suspended' | 'deleted';
  notify_in_app: number;
  notify_email: number;
  notify_whatsapp: number;
  notify_sms: number;
  created_at: number;
}

const OTP_TTL_MS = 5 * MINUTE;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_TTL_MS = 30 * MINUTE;

// ---- user lookups -----------------------------------------------------------

export function findUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(id) as UserRow | undefined;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').get(email) as UserRow | undefined;
}

export function findUserByMobile(mobile: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE mobile = ? AND deleted_at IS NULL').get(mobile) as UserRow | undefined;
}

// ---- access + refresh token issuing ----------------------------------------

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Issue an access token (with the user's live plan/role) plus an opaque rotating
 * refresh token, persisting its hash in `sessions`.
 */
export function issueUserTokens(user: UserRow, req?: Request): IssuedTokens {
  const plan = effectivePlan(user.id);
  const accessToken = signAccessToken({
    sub: user.id,
    kind: 'user',
    role: 'user',
    plan,
    planValidUntil: user.plan_valid_until ?? null,
  });

  const refreshToken = randomToken();
  const ts = now();
  db.prepare(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, last_used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    user.id,
    hashToken(refreshToken),
    req?.header('user-agent') ?? null,
    req?.ip ?? null,
    ts + env.refreshTokenTtlSec * 1000,
    ts,
    ts,
  );

  return { accessToken, refreshToken, expiresIn: env.accessTokenTtlSec };
}

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
  revoked_at: number | null;
}

/**
 * Rotate a refresh token: validate the presented token's session, revoke it,
 * issue a fresh access+refresh pair from the live user record.
 */
export function rotateRefresh(refreshToken: string, req?: Request): IssuedTokens {
  const row = db
    .prepare('SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE refresh_token_hash = ?')
    .get(hashToken(refreshToken)) as SessionRow | undefined;
  if (!row || row.revoked_at) throw Errors.invalidToken('Invalid refresh token');
  if (row.expires_at < now()) throw Errors.tokenExpired('Refresh token expired');

  const user = findUserById(row.user_id);
  if (!user || user.status !== 'active') throw Errors.invalidToken('Invalid refresh token');

  // Revoke the old session, then mint a fresh one.
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(now(), row.id);
  return issueUserTokens(user, req);
}

/** Revoke the single session matching the presented refresh token (best-effort). */
export function revokeRefresh(refreshToken: string): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND revoked_at IS NULL').run(
    now(),
    hashToken(refreshToken),
  );
}

/** Revoke every active session for a user. */
export function revokeAllSessions(userId: string): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now(), userId);
}

export function touchLastLogin(userId: string): void {
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), userId);
}

// ---- OTP create / verify ----------------------------------------------------

export interface CreatedOtp {
  otpId: string;
  code: string;
  expiresInSec: number;
  resendInSec: number;
}

interface OtpRow {
  id: string;
  user_id: string | null;
  channel: string;
  destination: string;
  purpose: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  consumed_at: number | null;
  expires_at: number;
  created_at: number;
}

/**
 * Create an OTP for a destination/purpose. Enforces a 60s resend cooldown by
 * inspecting the most recent unconsumed code for the same destination+purpose.
 */
export function createOtp(params: {
  channel: 'email' | 'sms' | 'whatsapp';
  destination: string;
  purpose: 'login' | 'signup' | 'verify_email' | 'verify_mobile' | 'reset_password';
  userId?: string | null;
  req?: Request;
}): CreatedOtp {
  const ts = now();
  const recent = db
    .prepare(
      `SELECT created_at FROM otp_codes
       WHERE destination = ? AND purpose = ? AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(params.destination, params.purpose) as { created_at: number } | undefined;
  if (recent && ts - recent.created_at < OTP_RESEND_COOLDOWN_MS) {
    const retry = Math.ceil((OTP_RESEND_COOLDOWN_MS - (ts - recent.created_at)) / 1000);
    throw Errors.rateLimited('Please wait before requesting another code.', retry);
  }

  const code = generateOtp();
  const id = newId();
  db.prepare(
    `INSERT INTO otp_codes (id, user_id, channel, destination, purpose, code_hash, max_attempts, expires_at, created_at, created_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.userId ?? null,
    params.channel,
    params.destination,
    params.purpose,
    hashOtp(code),
    5,
    ts + OTP_TTL_MS,
    ts,
    params.req?.ip ?? null,
  );

  return { otpId: id, code, expiresInSec: Math.round(OTP_TTL_MS / 1000), resendInSec: 60 };
}

/**
 * Verify an OTP by id+code. Increments attempts on mismatch; marks consumed on
 * success. Throws AppError on any failure path. Returns the matched OTP row.
 */
export function verifyOtp(otpId: string, code: string): OtpRow {
  const row = db.prepare('SELECT * FROM otp_codes WHERE id = ?').get(otpId) as OtpRow | undefined;
  if (!row) throw Errors.invalidToken('Invalid or expired code');
  if (row.consumed_at) throw Errors.invalidToken('This code has already been used');
  if (row.expires_at < now()) throw Errors.invalidToken('This code has expired');
  if (row.attempts >= row.max_attempts) throw Errors.invalidToken('Too many attempts. Request a new code.');

  if (row.code_hash !== hashOtp(code)) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(otpId);
    throw Errors.invalidToken('Incorrect code');
  }

  db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(now(), otpId);
  return row;
}

// ---- password reset tokens (stored as OTPs, purpose reset_password) ---------

/** Create a password-reset token (30-min) whose hash is stored in otp_codes. */
export function createResetToken(user: UserRow): string {
  const token = randomToken();
  const ts = now();
  db.prepare(
    `INSERT INTO otp_codes (id, user_id, channel, destination, purpose, code_hash, max_attempts, expires_at, created_at)
     VALUES (?, ?, 'email', ?, 'reset_password', ?, 1, ?, ?)`,
  ).run(newId(), user.id, user.email ?? user.id, hashToken(token), ts + RESET_TTL_MS, ts);
  return token;
}

/** Consume a reset/verify token (purpose-scoped) and return its user id. */
export function consumeTokenByPurpose(
  token: string,
  purpose: 'reset_password' | 'verify_email',
): { userId: string } {
  const row = db
    .prepare('SELECT * FROM otp_codes WHERE code_hash = ? AND purpose = ?')
    .get(hashToken(token), purpose) as OtpRow | undefined;
  if (!row) throw Errors.invalidToken('Invalid or expired link');
  if (row.consumed_at) throw Errors.invalidToken('This link has already been used');
  if (row.expires_at < now()) throw Errors.invalidToken('This link has expired');
  if (!row.user_id) throw Errors.invalidToken('Invalid link');

  db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(now(), row.id);
  return { userId: row.user_id };
}

/** Create an email-verification token (30-min) stored in otp_codes. */
export function createEmailVerifyToken(user: UserRow): string {
  const token = randomToken();
  const ts = now();
  db.prepare(
    `INSERT INTO otp_codes (id, user_id, channel, destination, purpose, code_hash, max_attempts, expires_at, created_at)
     VALUES (?, ?, 'email', ?, 'verify_email', ?, 1, ?, ?)`,
  ).run(newId(), user.id, user.email ?? user.id, hashToken(token), ts + RESET_TTL_MS, ts);
  return token;
}
