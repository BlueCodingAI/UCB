import type { Request, RequestHandler } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Errors } from '../lib/errors';

function clientKey(req: Request): string {
  if (req.auth?.sub) return `u:${req.auth.sub}`;
  return `ip:${req.ip}`;
}

/** Build an express middleware around a memory token-bucket limiter. */
export function rateLimit(opts: { points: number; durationSec: number; keyPrefix: string }): RequestHandler {
  const limiter = new RateLimiterMemory({
    points: opts.points,
    duration: opts.durationSec,
    keyPrefix: opts.keyPrefix,
  });
  return (req, res, next) => {
    limiter
      .consume(clientKey(req))
      .then((r) => {
        res.setHeader('X-RateLimit-Limit', opts.points);
        res.setHeader('X-RateLimit-Remaining', r.remainingPoints);
        next();
      })
      .catch((rej: { msBeforeNext?: number }) => {
        const retry = Math.ceil((rej.msBeforeNext ?? 1000) / 1000);
        res.setHeader('Retry-After', retry);
        next(Errors.rateLimited('Too many requests. Please slow down.', retry));
      });
  };
}

/** Global per-IP limiter. */
export const globalLimiter = rateLimit({ points: 120, durationSec: 10, keyPrefix: 'global' });

/** Strict limiter for auth/OTP endpoints. */
export const authLimiter = rateLimit({ points: 8, durationSec: 60, keyPrefix: 'auth' });
