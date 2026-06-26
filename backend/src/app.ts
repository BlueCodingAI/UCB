import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { ok } from './lib/response';
import { requestId } from './middleware/requestId';
import { authOptional } from './middleware/auth';
import { globalLimiter } from './middleware/rateLimit';
import { notFoundHandler, errorHandler } from './middleware/error';
import { buildApiRouter } from './routes';
import { openaiHealth } from './services/openai';
import { sarvamHealth } from './services/sarvam';
import { razorpayHealth } from './services/razorpay';
import { emailHealth } from './services/email';

const START = Date.now();

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId ?? '',
      autoLogging: { ignore: (req) => req.url === '/healthz' },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false, // API server; CSP enforced by the Next.js frontend
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser(env.cookieSecret));

  // JSON parser captures the raw body buffer so the Razorpay webhook can verify HMAC.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(globalLimiter);
  app.use(authOptional);

  // Health probes (outside /api/v1, no DB hit on liveness).
  app.get('/healthz', (_req, res) => ok(res, { status: 'up', uptimeSec: Math.round((Date.now() - START) / 1000) }));
  app.get('/readyz', (_req, res) => {
    res.json({
      ok: true,
      data: {
        db: 'ok',
        openai: openaiHealth(),
        sarvam: sarvamHealth(),
        razorpay: razorpayHealth(),
        email: emailHealth(),
      },
    });
  });

  // Serve uploaded files (banner images, etc.).
  app.use('/uploads', express.static(`${env.storageDir}/uploads`, { maxAge: '7d', immutable: true }));

  app.use('/api/v1', buildApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
