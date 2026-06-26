import pino from 'pino';
import { env } from '../config/env';

const transport = env.isDev
  ? {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    }
  : undefined;

export const logger = pino({
  level: env.logLevel,
  transport,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'password_hash',
      'code',
      'code_hash',
      'otp',
      'refreshToken',
      'razorpay_signature',
      '*.password',
      '*.otp',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
