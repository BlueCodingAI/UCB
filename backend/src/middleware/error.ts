import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError, Errors } from '../lib/errors';
import { logger } from '../lib/logger';

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: { code: 'not_found', message: `Route ${req.method} ${req.path} not found`, requestId: req.requestId },
  });
}

/** Centralized error handler — maps known errors to the standard envelope. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appErr: AppError;

  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof ZodError) {
    appErr = Errors.validation(
      'Validation failed',
      err.errors.map((e) => ({ field: e.path.join('.') || '(root)', issue: e.message })),
    );
  } else if (err instanceof MulterError) {
    appErr = err.code === 'LIMIT_FILE_SIZE' ? Errors.payloadTooLarge('File too large') : Errors.validation(err.message);
  } else if (err instanceof Error && /entity too large/i.test(err.message)) {
    appErr = Errors.payloadTooLarge();
  } else {
    appErr = Errors.internal();
    logger.error({ err, requestId: req.requestId }, 'unhandled error');
  }

  if (appErr.status >= 500) {
    logger.error({ err, requestId: req.requestId, code: appErr.code }, appErr.message);
  }

  res.status(appErr.status).json({
    ok: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details ? { details: appErr.details } : {}),
      ...(appErr.extra ? appErr.extra : {}),
      requestId: req.requestId,
    },
  });
}
