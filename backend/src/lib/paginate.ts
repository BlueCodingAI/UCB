import type { Request } from 'express';

export interface OffsetParams {
  page: number;
  pageSize: number;
  offset: number;
  sort: string;
  order: 'asc' | 'desc';
  q: string;
  filters: Record<string, string>;
}

const MAX_PAGE_SIZE = 100;

/** Parse standard offset pagination + sort + search + filter[x] query params. */
export function parseOffset(req: Request, defaults: { sort?: string; pageSize?: number } = {}): OffsetParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(req.query.pageSize ?? defaults.pageSize ?? 25), 10) || 25),
  );
  const sort = String(req.query.sort ?? defaults.sort ?? 'createdAt');
  const order = String(req.query.order ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const q = String(req.query.q ?? '').trim();

  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) {
    const m = key.match(/^filter\[(.+)\]$/);
    if (m && typeof value === 'string') filters[m[1]] = value;
  }
  return { page, pageSize, offset: (page - 1) * pageSize, sort, order, q, filters };
}

export function offsetMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface CursorParams {
  limit: number;
  cursor: string | null;
}

/** Parse cursor pagination (feeds). Cursor is an opaque ULID. */
export function parseCursor(req: Request, defaultLimit = 20): CursorParams {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query.limit ?? defaultLimit), 10) || defaultLimit));
  const cursor = req.query.cursor ? String(req.query.cursor) : null;
  return { limit, cursor };
}
