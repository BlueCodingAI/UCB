import { Router } from 'express';
import metaRouter from './modules/meta/meta.routes';

// Module routers (wired by the integrator as modules are implemented).
import authRouter from './modules/auth/auth.routes';
import adminAuthRouter from './modules/auth/adminAuth.routes';
import profileRouter from './modules/profile/profile.routes';
import chatRouter from './modules/chat/chat.routes';
import voiceRouter from './modules/voice/voice.routes';
import recommendationsRouter from './modules/recommendations/recommendations.routes';
import plansRouter from './modules/payments/plans.routes';
import paymentsRouter from './modules/payments/payments.routes';
import counsellingRouter from './modules/counselling/counselling.routes';
import notificationsRouter from './modules/notifications/notifications.routes';
import bannersRouter from './modules/banners/banners.routes';
import adminRouter from './modules/admin/admin.routes';

/** Builds the /api/v1 router by mounting every module. */
export function buildApiRouter(): Router {
  const api = Router();

  api.use('/meta', metaRouter);
  api.use('/auth', authRouter);
  api.use('/admin/auth', adminAuthRouter);
  api.use('/profile', profileRouter);
  api.use('/chat', chatRouter);
  api.use('/voice', voiceRouter);
  api.use('/recommendations', recommendationsRouter);
  api.use('/plans', plansRouter);
  api.use('/payments', paymentsRouter);
  api.use('/counselling', counsellingRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/banners', bannersRouter);
  api.use('/admin', adminRouter);

  return api;
}
