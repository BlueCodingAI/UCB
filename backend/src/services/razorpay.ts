import Razorpay from 'razorpay';
import { env, integrations } from '../config/env';
import { hmacSha256Hex, safeEqual } from '../lib/crypto';
import { logger } from '../lib/logger';
import { Errors } from '../lib/errors';

let _client: Razorpay | null = null;
function client(): Razorpay {
  if (!_client) {
    _client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  }
  return _client;
}

export interface CreatedOrder {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

/** Create a Razorpay order (or a mock one in dev without keys). */
export async function createOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<CreatedOrder> {
  if (!integrations.razorpayEnabled) {
    // Dev mock order so the checkout flow is exercisable without keys.
    return {
      orderId: `order_mock_${receipt}`,
      amountPaise,
      currency: 'INR',
      keyId: env.razorpayKeyId || 'rzp_test_mock',
    };
  }
  try {
    const order = await client().orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes,
    });
    return { orderId: order.id, amountPaise, currency: 'INR', keyId: env.razorpayKeyId };
  } catch (err) {
    logger.error({ err }, 'razorpay order create failed');
    throw Errors.paymentFailed('Could not start payment. Please try again.');
  }
}

/** Verify the checkout handler signature: HMAC(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!integrations.razorpayEnabled) return true; // dev mock
  const expected = hmacSha256Hex(env.razorpayKeySecret, `${orderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

/** Verify a webhook signature over the RAW request body. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.razorpayWebhookSecret) return false;
  const expected = hmacSha256Hex(env.razorpayWebhookSecret, rawBody);
  return safeEqual(expected, signature);
}

export function razorpayHealth(): 'ok' | 'degraded' {
  return integrations.razorpayEnabled ? 'ok' : 'degraded';
}
