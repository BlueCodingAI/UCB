import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok, noContent } from '../../lib/response';
import * as service from './profile.service';
import type { UpdateProfileInput, UpdateCapProfileInput } from './profile.schema';

/** Wrap an async handler so thrown errors flow to the central error middleware. */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** GET /profile — account basics. */
export const getProfile = asyncHandler((req, res) => {
  const userId = req.auth!.sub;
  ok(res, service.getAccount(userId));
});

/** PUT /profile — update account basics, return updated user. */
export const updateProfile = asyncHandler((req, res) => {
  const userId = req.auth!.sub;
  const updated = service.updateAccount(userId, req.body as UpdateProfileInput);
  ok(res, updated);
});

/** GET /profile/cap — CAP profile memory (null-defaults if absent). */
export const getCapProfile = asyncHandler((req, res) => {
  const userId = req.auth!.sub;
  ok(res, service.getCapProfile(userId));
});

/** PUT /profile/cap — upsert CAP profile memory. */
export const updateCapProfile = asyncHandler((req, res) => {
  const userId = req.auth!.sub;
  const updated = service.upsertCapProfile(userId, req.body as UpdateCapProfileInput);
  ok(res, updated);
});

/** DELETE /profile/cap — clear CAP profile memory. */
export const deleteCapProfile = asyncHandler((req, res) => {
  const userId = req.auth!.sub;
  service.clearCapProfile(userId);
  noContent(res);
});
