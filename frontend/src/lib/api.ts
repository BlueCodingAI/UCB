import { API_BASE_URL } from './constants';
import type { ApiErr, ApiOk, Pagination } from './types';

export type Realm = 'user' | 'admin';

const TOKEN_KEYS: Record<Realm, string> = { user: 'disha_access', admin: 'disha_admin_access' };

const memoryToken: Record<Realm, string | null> = { user: null, admin: null };

export function setAccessToken(realm: Realm, token: string | null): void {
  memoryToken[realm] = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem(TOKEN_KEYS[realm], token);
    else localStorage.removeItem(TOKEN_KEYS[realm]);
  }
}

export function getAccessToken(realm: Realm): string | null {
  if (memoryToken[realm]) return memoryToken[realm];
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem(TOKEN_KEYS[realm]);
    memoryToken[realm] = t;
    return t;
  }
  return null;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: { field: string; issue: string }[];
  requiredPlan?: string;
  requestId?: string;

  constructor(status: number, body: ApiErr['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requiredPlan = body.requiredPlan;
    this.requestId = body.requestId;
  }
}

interface RequestOpts {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  realm?: Realm;
  /** Skip Authorization header (public endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: RequestOpts['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

const refreshing: Record<Realm, Promise<boolean> | null> = { user: null, admin: null };

async function tryRefresh(realm: Realm): Promise<boolean> {
  if (refreshing[realm]) return refreshing[realm]!;
  const endpoint = realm === 'admin' ? '/admin/auth/refresh' : '/auth/refresh';
  const p = (async () => {
    try {
      const res = await fetch(buildUrl(endpoint), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) return false;
      const json = (await res.json()) as ApiOk<{ accessToken: string }>;
      if (json.ok && json.data.accessToken) {
        setAccessToken(realm, json.data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshing[realm] = null;
    }
  })();
  refreshing[realm] = p;
  return p;
}

interface FullResponse<T> {
  data: T;
  meta?: { pagination?: Pagination };
}

async function doRequest<T>(method: string, path: string, opts: RequestOpts, retry = true): Promise<FullResponse<T>> {
  const realm = opts.realm ?? 'user';
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (!isForm && opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous) {
    const token = getAccessToken(realm);
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers,
    credentials: 'include',
    signal: opts.signal,
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  });

  if (res.status === 204) return { data: undefined as T };

  let json: ApiOk<T> | ApiErr;
  try {
    json = (await res.json()) as ApiOk<T> | ApiErr;
  } catch {
    throw new ApiError(res.status, { code: 'internal_error', message: 'Invalid server response', requestId: '' });
  }

  if (!json.ok) {
    // One transparent refresh+retry on expired token.
    if (res.status === 401 && json.error.code === 'token_expired' && retry && !opts.anonymous) {
      const ok = await tryRefresh(realm);
      if (ok) return doRequest<T>(method, path, opts, false);
    }
    throw new ApiError(res.status, json.error);
  }
  return { data: json.data, meta: json.meta };
}

async function unwrap<T>(method: string, path: string, opts: RequestOpts): Promise<T> {
  return (await doRequest<T>(method, path, opts)).data;
}

export const api = {
  get: <T>(path: string, opts: RequestOpts = {}) => unwrap<T>('GET', path, opts),
  getFull: <T>(path: string, opts: RequestOpts = {}) => doRequest<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts: RequestOpts = {}) => unwrap<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts: RequestOpts = {}) => unwrap<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts: RequestOpts = {}) => unwrap<T>('PATCH', path, { ...opts, body }),
  del: <T>(path: string, opts: RequestOpts = {}) => unwrap<T>('DELETE', path, opts),
};

/** Open an SSE/stream POST and return the raw Response for manual reading. */
export async function apiStream(path: string, body: unknown, realm: Realm = 'user'): Promise<Response> {
  const token = getAccessToken(realm);
  return fetch(buildUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Absolute URL for a backend upload path. */
export function uploadUrl(pathOrName: string): string {
  if (pathOrName.startsWith('http')) return pathOrName;
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const clean = pathOrName.startsWith('/uploads/') ? pathOrName : `/uploads/${pathOrName.replace(/^\/+/, '')}`;
  return `${origin}${clean}`;
}
