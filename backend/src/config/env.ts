import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

function str(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    return '';
  }
  return v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const NODE_ENV = str('NODE_ENV', 'development');

/**
 * Typed, centralized environment config. Missing optional integration keys
 * cause graceful degradation (see services/*), not a crash.
 */
export const env = {
  nodeEnv: NODE_ENV,
  isProd: NODE_ENV === 'production',
  isDev: NODE_ENV !== 'production',
  port: num('PORT', 4000),
  corsOrigin: str('CORS_ORIGIN', 'http://localhost:3000'),

  // Database
  databasePath: str('DATABASE_PATH', path.resolve(process.cwd(), 'data', 'disha.sqlite')),

  // Auth
  jwtSecret: str('JWT_SECRET', 'dev-insecure-jwt-secret-change-me'),
  accessTokenTtlSec: num('ACCESS_TOKEN_TTL_SEC', 15 * 60),
  refreshTokenTtlSec: num('REFRESH_TOKEN_TTL_SEC', 30 * 24 * 60 * 60),
  otpPepper: str('OTP_PEPPER', 'dev-otp-pepper-change-me'),
  cookieSecret: str('COOKIE_SECRET', 'dev-cookie-secret-change-me'),
  // Set the Secure flag on auth cookies. Defaults to prod, but MUST be false
  // when serving over plain HTTP (e.g. an IP-only deploy with no SSL) or the
  // browser will silently drop the refresh cookie and logins won't persist.
  cookieSecure: bool('COOKIE_SECURE', NODE_ENV === 'production'),

  // OpenAI
  openaiApiKey: str('OPENAI_API_KEY'),
  openaiChatModel: str('OPENAI_CHAT_MODEL', 'gpt-4o-mini'),
  openaiEmbeddingModel: str('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
  embeddingDim: num('EMBEDDING_DIM', 1536),
  // Outbound proxy for OpenAI requests (e.g. when the server is behind a firewall).
  openaiProxyEnabled: bool('OPENAI_PROXY_ENABLED', false),
  openaiProxyUrl: str('OPENAI_PROXY_URL'), // http(s)://[user:pass@]host:port

  // Sarvam
  sarvamApiKey: str('SARVAM_API_KEY'),
  sarvamBaseUrl: str('SARVAM_BASE_URL', 'https://api.sarvam.ai'),
  sarvamSttModel: str('SARVAM_STT_MODEL', 'saarika:v2'),
  sarvamTtsModel: str('SARVAM_TTS_MODEL', 'bulbul:v2'),
  sarvamTtsSpeaker: str('SARVAM_TTS_SPEAKER', 'anushka'),

  // Razorpay
  razorpayKeyId: str('RAZORPAY_KEY_ID'),
  razorpayKeySecret: str('RAZORPAY_KEY_SECRET'),
  razorpayWebhookSecret: str('RAZORPAY_WEBHOOK_SECRET'),

  // Email (SMTP)
  smtpHost: str('SMTP_HOST'),
  smtpPort: num('SMTP_PORT', 587),
  smtpUser: str('SMTP_USER'),
  smtpPass: str('SMTP_PASS'),
  mailFrom: str('MAIL_FROM', 'Disha CAP Guidance <no-reply@disha.local>'),

  // Optional channels
  whatsappApiToken: str('WHATSAPP_API_TOKEN'),
  whatsappPhoneId: str('WHATSAPP_PHONE_ID'),
  smsGatewayKey: str('SMS_GATEWAY_KEY'),

  // CAP / plan defaults
  admissionCutoffDate: str('ADMISSION_CUTOFF_DATE'), // ISO date e.g. 2026-08-31
  currentCapYear: num('CURRENT_CAP_YEAR', new Date().getUTCFullYear()),

  // Admin bootstrap (seed)
  adminBootstrapEmail: str('ADMIN_BOOTSTRAP_EMAIL', 'admin@disha.local'),
  adminBootstrapPassword: str('ADMIN_BOOTSTRAP_PASSWORD', 'Admin@12345'),
  adminBootstrapName: str('ADMIN_BOOTSTRAP_NAME', 'Disha Admin'),

  // RAG tuning (also stored in app_settings, editable in admin).
  // ragMinScore is the floor on the hybrid score (0.6*cosine + 0.4*keyword).
  // 0.2 is intentionally permissive for text-embedding-3-small (relevant cosines
  // are often only 0.30–0.45); the strict GROUNDING_PROMPT + exact-fallback gate
  // are the real backstop against off-topic context, so a low floor maximises
  // recall (finds info that IS in the KB) without weakening KB-only grounding.
  ragTopK: num('RAG_TOP_K', 8),
  ragMinScore: num('RAG_MIN_SCORE', 0.2),

  // Ops
  seasonMode: bool('SEASON_MODE', false),
  logLevel: str('LOG_LEVEL', NODE_ENV === 'production' ? 'info' : 'debug'),
  storageDir: str('STORAGE_DIR', path.resolve(process.cwd(), 'storage')),
} as const;

export const integrations = {
  openaiEnabled: Boolean(env.openaiApiKey),
  sarvamEnabled: Boolean(env.sarvamApiKey),
  razorpayEnabled: Boolean(env.razorpayKeyId && env.razorpayKeySecret),
  emailEnabled: Boolean(env.smtpHost && env.smtpUser),
  whatsappEnabled: Boolean(env.whatsappApiToken && env.whatsappPhoneId),
  smsEnabled: Boolean(env.smsGatewayKey),
} as const;

export type Env = typeof env;
