import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Errors } from './errors';

export type PlanCode = 'freemium' | 'premium' | 'super_premium';
export type ActorKind = 'user' | 'admin';

export interface AccessClaims {
  sub: string;
  kind: ActorKind;
  role: string; // 'user' for end-users; admin role code otherwise
  plan: PlanCode;
  planValidUntil: number | null;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: env.accessTokenTtlSec });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & AccessClaims;
    return {
      sub: decoded.sub as string,
      kind: decoded.kind,
      role: decoded.role,
      plan: decoded.plan,
      planValidUntil: decoded.planValidUntil ?? null,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw Errors.tokenExpired();
    throw Errors.invalidToken();
  }
}
