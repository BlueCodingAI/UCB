import type { AuthContext } from './index';

declare global {
  namespace Express {
    interface Request {
      /** Per-request ULID, set by requestId middleware. */
      requestId?: string;
      /** Decoded access-token claims, set by requireAuth/authOptional. */
      auth?: AuthContext;
      /** Raw body buffer (only populated for the Razorpay webhook route). */
      rawBody?: Buffer;
    }
  }
}

export {};
