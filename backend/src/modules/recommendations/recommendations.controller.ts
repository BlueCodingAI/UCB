import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok } from '../../lib/response';
import {
  listRecommendations,
  updateStepStatus,
  refreshRecommendations,
} from './recommendations.service';

/** Wrap an async handler so thrown errors reach the central error middleware. */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** GET /recommendations — list for the current user, ordered by priority desc. */
export const list = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const status = req.query.status as
    | 'pending'
    | 'in_progress'
    | 'done'
    | 'dismissed'
    | 'expired'
    | undefined;
  const data = listRecommendations(userId, status);
  ok(res, data);
});

/** POST /recommendations/steps/:stepId/status — update one step's status (owner check). */
export const updateStatus = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const { stepId } = req.params;
  const { status } = req.body as { status: 'pending' | 'in_progress' | 'done' | 'dismissed' };
  const data = updateStepStatus(userId, stepId, status);
  ok(res, data);
});

/** POST /recommendations/refresh — regenerate next steps from CAP stage. */
export const refresh = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const data = refreshRecommendations(userId);
  ok(res, data);
});
