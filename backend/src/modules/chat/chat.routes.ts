import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { requireUser } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createSessionSchema,
  sessionIdParams,
  messageIdParams,
  sendMessageSchema,
  renameSessionSchema,
  feedbackSchema,
  messagesQuerySchema,
} from './chat.schema';
import {
  getSessions,
  postSession,
  getMessages,
  postMessage,
  streamMessage,
  patchSession,
  removeSession,
  postFeedback,
  getUsageController,
} from './chat.controller';

/** Wrap an async controller so thrown errors reach the central error handler. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const router = Router();

// Sessions
router.get('/sessions', requireUser, asyncHandler(getSessions));
router.post('/sessions', requireUser, validate({ body: createSessionSchema }), asyncHandler(postSession));

router.get(
  '/sessions/:id/messages',
  requireUser,
  validate({ params: sessionIdParams, query: messagesQuerySchema }),
  asyncHandler(getMessages),
);
router.post(
  '/sessions/:id/messages',
  requireUser,
  validate({ params: sessionIdParams, body: sendMessageSchema }),
  asyncHandler(postMessage),
);
router.post(
  '/sessions/:id/messages/stream',
  requireUser,
  validate({ params: sessionIdParams, body: sendMessageSchema }),
  asyncHandler(streamMessage),
);

router.patch(
  '/sessions/:id',
  requireUser,
  validate({ params: sessionIdParams, body: renameSessionSchema }),
  asyncHandler(patchSession),
);
router.delete(
  '/sessions/:id',
  requireUser,
  validate({ params: sessionIdParams }),
  asyncHandler(removeSession),
);

// Message feedback
router.post(
  '/messages/:msgId/feedback',
  requireUser,
  validate({ params: messageIdParams, body: feedbackSchema }),
  asyncHandler(postFeedback),
);

// Usage
router.get('/usage', requireUser, asyncHandler(getUsageController));

export default router;
