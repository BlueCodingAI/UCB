import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok } from '../../lib/response';
import { parseOffset, parseCursor, offsetMeta } from '../../lib/paginate';
import {
  getDashboard,
  listAuditLogsCursor,
  listAuditLogsOffset,
  listChatLogs,
  type AuditFilters,
  type ChatLogFilters,
} from './adminDashboard.service';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** GET /admin/dashboard — KPI snapshot. */
export const dashboard = asyncHandler((_req, res) => {
  ok(res, getDashboard());
});

/** GET /admin/audit-logs — cursor (default) or offset (when ?page given) paginate. */
export const auditLogs = asyncHandler((req, res) => {
  const { filters } = parseOffset(req);
  const f: AuditFilters = {
    actorType: filters.actorType,
    actorId: filters.actorId,
    action: filters.action,
    entityType: filters.entityType,
    entityId: filters.entityId,
  };

  if (req.query.page !== undefined) {
    const { page, pageSize } = parseOffset(req);
    const { items, total } = listAuditLogsOffset(f, page, pageSize);
    return ok(res, items, { pagination: offsetMeta(page, pageSize, total) });
  }

  const { limit, cursor } = parseCursor(req);
  const { items, nextCursor, hasMore } = listAuditLogsCursor(f, limit, cursor);
  ok(res, items, { pagination: { nextCursor, hasMore, limit } });
});

/** GET /admin/chat-logs — recent chat messages for KB-gap analysis (cursor feed). */
export const chatLogs = asyncHandler((req, res) => {
  const { filters } = parseOffset(req);
  const f: ChatLogFilters = {
    fallbackOnly: filters.fallback === '1' || filters.fallback === 'true',
    role: filters.role,
    language: filters.language,
    sessionId: filters.sessionId,
  };
  const { limit, cursor } = parseCursor(req);
  const { items, nextCursor, hasMore } = listChatLogs(f, limit, cursor);
  ok(res, items, { pagination: { nextCursor, hasMore, limit } });
});
