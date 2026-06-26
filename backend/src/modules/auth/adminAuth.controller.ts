import type { Request, Response } from 'express';
import { db } from '../../db/connection';
import { ok, noContent } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { env } from '../../config/env';
import { verifyPassword, randomToken, hashToken } from '../../lib/crypto';
import { signAccessToken } from '../../lib/jwt';
import { writeAudit } from '../../middleware/audit';
import { asyncHandler } from './auth.controller';

const ADMIN_REFRESH_COOKIE = 'ucb_admin_rt';

interface AdminRow {
  id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  password_hash: string;
  role_code: string;
  status: 'active' | 'suspended' | 'disabled';
  created_at: number;
}

interface AdminSessionRow {
  id: string;
  admin_user_id: string;
  expires_at: number;
  revoked_at: number | null;
}

function setAdminCookie(res: Response, token: string): void {
  res.cookie(ADMIN_REFRESH_COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: env.cookieSecure,
    signed: true,
    maxAge: env.refreshTokenTtlSec * 1000,
  });
}

function clearAdminCookie(res: Response): void {
  res.clearCookie(ADMIN_REFRESH_COOKIE, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: env.cookieSecure,
    signed: true,
  });
}

function presentedAdminToken(req: Request): string | null {
  const fromCookie = req.signedCookies?.[ADMIN_REFRESH_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof fromBody === 'string' && fromBody ? fromBody : null;
}

function findAdminById(id: string): AdminRow | undefined {
  return db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as AdminRow | undefined;
}

/** Shape an admin row as a User-compatible object for the frontend AuthProvider. */
function presentAdmin(admin: AdminRow) {
  return {
    id: admin.id,
    fullName: admin.full_name,
    email: admin.email,
    mobile: admin.mobile ?? null,
    preferredLanguage: 'en' as const,
    locationCity: null,
    locationDistrict: null,
    currentPlanCode: 'super_premium' as const,
    planValidUntil: null,
    status: 'active' as const,
    emailVerified: true,
    mobileVerified: false,
    role: admin.role_code,
    createdAt: admin.created_at,
  };
}

function signAdminAccess(admin: AdminRow): string {
  return signAccessToken({
    sub: admin.id,
    kind: 'admin',
    role: admin.role_code,
    plan: 'super_premium',
    planValidUntil: null,
  });
}

function issueAdminTokens(admin: AdminRow, req: Request): { accessToken: string; refreshToken: string; expiresIn: number } {
  const accessToken = signAdminAccess(admin);
  const refreshToken = randomToken();
  const ts = now();
  db.prepare(
    `INSERT INTO admin_sessions (id, admin_user_id, refresh_token_hash, ip_address, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    admin.id,
    hashToken(refreshToken),
    req.ip ?? null,
    req.header('user-agent') ?? null,
    ts + env.refreshTokenTtlSec * 1000,
    ts,
  );
  return { accessToken, refreshToken, expiresIn: env.accessTokenTtlSec };
}

// ---- POST /admin/auth/login -------------------------------------------------

export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const admin = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email) as AdminRow | undefined;
  if (!admin || admin.status !== 'active') throw Errors.unauthenticated('Invalid email or password');

  const okPass = await verifyPassword(password, admin.password_hash);
  if (!okPass) throw Errors.unauthenticated('Invalid email or password');

  const tokens = issueAdminTokens(admin, req);
  db.prepare('UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), admin.id);
  setAdminCookie(res, tokens.refreshToken);

  writeAudit({ actorType: 'admin', actorId: admin.id, action: 'admin.login', entityType: 'admin_user', entityId: admin.id, req });

  ok(res, { user: presentAdmin(admin), ...tokens });
});

// ---- POST /admin/auth/refresh -----------------------------------------------

export const adminRefresh = asyncHandler(async (req, res) => {
  const token = presentedAdminToken(req);
  if (!token) throw Errors.unauthenticated('No refresh token provided');

  const row = db
    .prepare('SELECT id, admin_user_id, expires_at, revoked_at FROM admin_sessions WHERE refresh_token_hash = ?')
    .get(hashToken(token)) as AdminSessionRow | undefined;
  if (!row || row.revoked_at) throw Errors.invalidToken('Invalid refresh token');
  if (row.expires_at < now()) throw Errors.tokenExpired('Refresh token expired');

  const admin = findAdminById(row.admin_user_id);
  if (!admin || admin.status !== 'active') throw Errors.invalidToken('Invalid refresh token');

  db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE id = ?').run(now(), row.id);
  const tokens = issueAdminTokens(admin, req);
  setAdminCookie(res, tokens.refreshToken);

  ok(res, { ...tokens });
});

// ---- POST /admin/auth/logout ------------------------------------------------

export const adminLogout = asyncHandler(async (req, res) => {
  const token = presentedAdminToken(req);
  if (token) {
    db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND revoked_at IS NULL').run(
      now(),
      hashToken(token),
    );
  }
  clearAdminCookie(res);
  noContent(res);
});

// ---- GET /admin/auth/me -----------------------------------------------------

export const adminMe = asyncHandler(async (req, res) => {
  const admin = findAdminById(req.auth!.sub);
  if (!admin) throw Errors.notFound('Admin not found');
  ok(res, { user: presentAdmin(admin) });
});
