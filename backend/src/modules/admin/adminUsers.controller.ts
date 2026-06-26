import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok, noContent } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { parseOffset, offsetMeta } from '../../lib/paginate';
import { writeAudit } from '../../middleware/audit';
import { activateSubscription } from '../payments/payments.service';
import type { PlanCode } from '../../types';
import {
  listUsers,
  getUserDetail,
  getUserRow,
  updateUser,
  softDeleteUser,
  overridePlanValidUntil,
} from './adminUsers.service';
import type { UpdateUserBody, GrantPlanBody } from './adminUsers.schema';

/** Wrap an async controller so thrown errors flow to the central handler. */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export const list = asyncHandler((req, res) => {
  const { page, pageSize, sort, order, q, filters } = parseOffset(req, { sort: 'createdAt' });
  const { items, total } = listUsers(
    q,
    { plan: filters.plan, status: filters.status, language: filters.language },
    page,
    pageSize,
    sort,
    order,
  );
  ok(res, items, { pagination: offsetMeta(page, pageSize, total) });
});

export const detail = asyncHandler((req, res) => {
  ok(res, getUserDetail(req.params.id));
});

export const patch = asyncHandler((req, res) => {
  const id = req.params.id;
  const before = getUserRow(id);
  const updated = updateUser(id, req.body as UpdateUserBody);
  const after = getUserRow(id);
  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'user.update',
    entityType: 'user',
    entityId: id,
    before,
    after,
    req,
  });
  ok(res, updated);
});

export const grantPlan = asyncHandler((req, res) => {
  const id = req.params.id;
  const body = req.body as GrantPlanBody;
  const before = getUserRow(id);
  if (before.status === 'deleted') throw Errors.conflict('Cannot grant a plan to a deleted user');

  const { validUntil } = activateSubscription(id, body.planCode as PlanCode, null, 'admin_grant');
  let effectiveValidUntil = validUntil;
  if (body.validUntil != null) {
    overridePlanValidUntil(id, body.validUntil);
    effectiveValidUntil = body.validUntil;
  }

  const after = getUserRow(id);
  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'user.grant_plan',
    entityType: 'user',
    entityId: id,
    before,
    after,
    req,
  });
  ok(res, { planCode: body.planCode, planValidUntil: effectiveValidUntil });
});

export const remove = asyncHandler((req, res) => {
  const id = req.params.id;
  const before = getUserRow(id);
  softDeleteUser(id);
  const after = getUserRow(id);
  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'user.delete',
    entityType: 'user',
    entityId: id,
    before,
    after,
    req,
  });
  noContent(res);
});
