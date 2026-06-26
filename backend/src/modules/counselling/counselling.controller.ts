import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok, created, noContent } from '../../lib/response';
import {
  listOpenSlots,
  createRequest,
  listRequests,
  getRequestDetail,
  bookSlot,
  cancelAppointment,
} from './counselling.service';
import type { CreateRequestBody, BookBody } from './counselling.schema';

/** Wrap an async controller so thrown errors reach the central handler. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const getSlots = asyncHandler((req: Request, res: Response) => {
  const mode = req.query.mode as string | undefined;
  ok(res, listOpenSlots(mode));
});

export const postRequest = asyncHandler((req: Request, res: Response) => {
  const body = req.body as CreateRequestBody;
  created(res, createRequest(req.auth!.sub, body));
});

export const getRequests = asyncHandler((req: Request, res: Response) => {
  ok(res, listRequests(req.auth!.sub));
});

export const getRequest = asyncHandler((req: Request, res: Response) => {
  ok(res, getRequestDetail(req.auth!.sub, req.params.id));
});

export const postBook = asyncHandler((req: Request, res: Response) => {
  const body = req.body as BookBody;
  created(res, bookSlot(req.auth!.sub, req.params.id, body.slotId));
});

export const postCancel = asyncHandler((req: Request, res: Response) => {
  cancelAppointment(req.auth!.sub, req.params.id);
  noContent(res);
});
