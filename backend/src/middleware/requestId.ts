import type { Request, Response, NextFunction } from 'express';
import { newId } from '../lib/ids';

/** Assign a ULID request id, expose on res header and req.requestId. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 64 ? incoming : newId();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
