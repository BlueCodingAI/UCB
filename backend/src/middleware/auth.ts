import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken, type PlanCode } from '../lib/jwt';
import { Errors } from '../lib/errors';
import { db } from '../db/connection';
import { now } from '../lib/time';

const PLAN_RANK: Record<PlanCode, number> = { freemium: 0, premium: 1, super_premium: 2 };

function bearer(req: Request): string | null {
  const h = req.header('authorization');
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

/** Attach req.auth if a valid token is present; never throws. */
export const authOptional: RequestHandler = (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next();
  try {
    req.auth = verifyAccessToken(token);
  } catch {
    /* ignore — treat as anonymous */
  }
  next();
};

/** Require a valid access token (any kind). */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next(Errors.unauthenticated());
  req.auth = verifyAccessToken(token); // throws AppError on bad/expired token
  next();
};

/** Require an authenticated end-user. */
export const requireUser: RequestHandler = (req, res, next) => {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.auth?.kind !== 'user') return next(Errors.forbidden('User account required'));
    next();
  });
};

/** Require an admin (optionally with one of the given role codes). */
export function requireRole(...roles: string[]): RequestHandler {
  return (req, res, next) => {
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (req.auth?.kind !== 'admin') return next(Errors.forbidden('Admin access required'));
      const role = req.auth.role;
      if (role === 'super_admin') return next(); // super admin bypasses role checks
      if (roles.length && !roles.includes(role)) return next(Errors.forbidden('Insufficient role'));
      next();
    });
  };
}

interface PlanRow {
  current_plan_code: PlanCode;
  plan_valid_until: number | null;
}

/** Effective plan for a user, downgrading to freemium if the subscription expired. */
export function effectivePlan(userId: string): PlanCode {
  const row = db.prepare('SELECT current_plan_code, plan_valid_until FROM users WHERE id = ?').get(userId) as
    | PlanRow
    | undefined;
  if (!row) return 'freemium';
  if (row.current_plan_code === 'freemium') return 'freemium';
  if (row.plan_valid_until && row.plan_valid_until < now()) return 'freemium';
  return row.current_plan_code;
}

/** Require the user's live plan to meet `min` (premium ⇒ premium or super). */
export function requirePlan(min: PlanCode): RequestHandler {
  return (req, res, next) => {
    requireUser(req, res, (err?: unknown) => {
      if (err) return next(err);
      const plan = effectivePlan(req.auth!.sub);
      if (PLAN_RANK[plan] < PLAN_RANK[min]) return next(Errors.planRequired(min, 'Upgrade your plan to use this feature.'));
      next();
    });
  };
}

interface FeatureRow {
  feat_profile_memory: number;
  feat_next_steps: number;
  feat_counselling_assist: number;
  feat_one_to_one: number;
  feat_in_person: number;
  feat_voice: number;
}

export type FeatureFlag =
  | 'profile_memory'
  | 'next_steps'
  | 'counselling_assist'
  | 'one_to_one'
  | 'in_person'
  | 'voice';

/** Require a specific plan feature flag (read live from the user's plan). */
export function requireFeature(flag: FeatureFlag): RequestHandler {
  return (req, res, next) => {
    requireUser(req, res, (err?: unknown) => {
      if (err) return next(err);
      const plan = effectivePlan(req.auth!.sub);
      const row = db
        .prepare(
          `SELECT feat_profile_memory, feat_next_steps, feat_counselling_assist,
                  feat_one_to_one, feat_in_person, feat_voice FROM plans WHERE code = ?`,
        )
        .get(plan) as FeatureRow | undefined;
      const col = `feat_${flag}` as keyof FeatureRow;
      if (!row || row[col] !== 1) return next(Errors.planRequired('premium', 'This feature is not in your plan.'));
      next();
    });
  };
}
