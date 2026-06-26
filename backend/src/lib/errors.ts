/** Domain error codes mapped to HTTP statuses by the error middleware. */
export type ErrorCode =
  | 'validation_error'
  | 'unauthenticated'
  | 'token_expired'
  | 'invalid_token'
  | 'forbidden'
  | 'plan_required'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'payment_failed'
  | 'upstream_unavailable'
  | 'internal_error';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_error: 422,
  unauthenticated: 401,
  token_expired: 401,
  invalid_token: 401,
  forbidden: 403,
  plan_required: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media_type: 415,
  payment_failed: 402,
  upstream_unavailable: 503,
  internal_error: 500,
};

export interface ErrorDetail {
  field: string;
  issue: string;
}

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: ErrorDetail[];
  extra?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, opts: { details?: ErrorDetail[]; extra?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = opts.details;
    this.extra = opts.extra;
  }
}

export const Errors = {
  validation: (message = 'Validation failed', details?: ErrorDetail[]) =>
    new AppError('validation_error', message, { details }),
  unauthenticated: (message = 'Authentication required') => new AppError('unauthenticated', message),
  tokenExpired: (message = 'Token expired') => new AppError('token_expired', message),
  invalidToken: (message = 'Invalid token') => new AppError('invalid_token', message),
  forbidden: (message = 'You do not have access to this resource') => new AppError('forbidden', message),
  planRequired: (requiredPlan: string, message = 'A higher plan is required') =>
    new AppError('plan_required', message, { extra: { requiredPlan } }),
  notFound: (message = 'Not found') => new AppError('not_found', message),
  conflict: (message = 'Conflict') => new AppError('conflict', message),
  rateLimited: (message = 'Too many requests', retryAfterSec?: number) =>
    new AppError('rate_limited', message, { extra: { retryAfterSec } }),
  payloadTooLarge: (message = 'Payload too large') => new AppError('payload_too_large', message),
  unsupportedMedia: (message = 'Unsupported media type') => new AppError('unsupported_media_type', message),
  paymentFailed: (message = 'Payment failed') => new AppError('payment_failed', message),
  upstreamUnavailable: (message = 'An upstream service is unavailable. Please retry.') =>
    new AppError('upstream_unavailable', message),
  internal: (message = 'Something went wrong') => new AppError('internal_error', message),
};
