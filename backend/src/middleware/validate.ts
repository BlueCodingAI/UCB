import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { Errors } from '../lib/errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toDetails(err: ZodError) {
  return err.errors.map((e) => ({ field: e.path.join('.') || '(root)', issue: e.message }));
}

/**
 * Validate request parts against zod schemas. Parsed (coerced) values replace
 * the originals so controllers read typed data.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
      next();
    } catch (err) {
      if (err instanceof ZodError) return next(Errors.validation('Validation failed', toDetails(err)));
      next(err);
    }
  };
}

export type Infer<T extends ZodTypeAny> = ZodInfer<T>;
