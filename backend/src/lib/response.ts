import type { Response } from 'express';

export interface PaginationMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  limit?: number;
}

export interface ResponseMeta {
  pagination?: PaginationMeta;
  [k: string]: unknown;
}

/** Standard success envelope: { ok: true, data, meta? }. */
export function ok<T>(res: Response, data: T, meta?: ResponseMeta, status = 200): Response {
  return res.status(status).json({ ok: true, data, ...(meta ? { meta } : {}) });
}

/** 201 Created helper. */
export function created<T>(res: Response, data: T, meta?: ResponseMeta): Response {
  return ok(res, data, meta, 201);
}

/** 204 No Content helper. */
export function noContent(res: Response): Response {
  return res.status(204).end();
}
