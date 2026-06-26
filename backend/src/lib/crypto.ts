import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/** SHA-256 hex digest. */
export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Cryptographically random URL-safe token (for refresh tokens, reset links). */
export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Hash a refresh/reset token for at-rest storage. */
export function hashToken(token: string): string {
  return sha256(token);
}

/** Generate a numeric OTP of given length (default 6). */
export function generateOtp(length = 6): string {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, '0');
}

/** Hash an OTP with the server-side pepper. */
export function hashOtp(code: string): string {
  return crypto.createHmac('sha256', env.otpPepper).update(code).digest('hex');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** HMAC-SHA256 hex (used for Razorpay signature verification). */
export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
