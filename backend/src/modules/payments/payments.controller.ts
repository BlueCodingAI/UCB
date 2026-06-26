import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { newReceipt } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { writeAudit } from '../../middleware/audit';
import * as razorpay from '../../services/razorpay';
import { createNotification } from '../notifications/notifications.service';
import {
  listActivePlans,
  getSubscriptionView,
  listPayments,
  getPlanRow,
  createPaymentRecord,
  getPaymentByOrderId,
  markPaymentPaid,
  recordWebhookEvent,
  markWebhookProcessed,
  activateSubscription,
} from './payments.service';
import type { CreateOrderInput, VerifyPaymentInput } from './payments.schema';
import type { PlanCode } from '../../types';

/** Wrap an async controller so thrown errors reach the central error handler. */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// ---------------------------------------------------------------------------
// PLANS
// ---------------------------------------------------------------------------

/** GET /plans — public list of active plans. */
export const getPlans: RequestHandler = (_req, res) => {
  ok(res, listActivePlans());
};

/** GET /subscription — current subscription + plan + validity (freemium default). */
export const getSubscription: RequestHandler = (req, res) => {
  ok(res, getSubscriptionView(req.auth!.sub));
};

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------

/** GET /payments — the user's payment history. */
export const getPayments: RequestHandler = (req, res) => {
  ok(res, listPayments(req.auth!.sub));
};

/** POST /payments/order — create a Razorpay order for a paid plan. */
export const createOrder = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const { planCode } = req.body as CreateOrderInput;

  const plan = getPlanRow(planCode);
  if (!plan || !plan.is_active) throw Errors.notFound('Plan not found');
  if (plan.price_paise <= 0) throw Errors.validation('This plan is not purchasable');

  const receipt = newReceipt(`pay_${userId}`);
  const order = await razorpay.createOrder(plan.price_paise, receipt, {
    userId,
    planCode,
  });

  createPaymentRecord({
    userId,
    planCode: planCode as PlanCode,
    amountPaise: order.amountPaise,
    currency: order.currency,
    razorpayOrderId: order.orderId,
    receipt,
  });

  writeAudit({
    actorType: 'user',
    actorId: userId,
    action: 'payment.order_created',
    entityType: 'payment',
    entityId: order.orderId,
    after: { planCode, amountPaise: order.amountPaise },
    req,
  });

  ok(res, {
    orderId: order.orderId,
    amountPaise: order.amountPaise,
    currency: order.currency,
    keyId: order.keyId,
    planCode,
  });
});

/** POST /payments/verify — confirm a checkout result and activate the plan. */
export const verifyPayment = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  const { orderId, paymentId, signature } = req.body as VerifyPaymentInput;

  const payment = getPaymentByOrderId(orderId);
  if (!payment || payment.user_id !== userId) throw Errors.notFound('Payment not found');

  const valid = razorpay.verifyCheckoutSignature(orderId, paymentId, signature);
  if (!valid) {
    writeAudit({
      actorType: 'user',
      actorId: userId,
      action: 'payment.verify_failed',
      entityType: 'payment',
      entityId: payment.id,
      req,
    });
    throw Errors.paymentFailed('Payment verification failed.');
  }

  markPaymentPaid(payment.id, { razorpayPaymentId: paymentId, signature });
  const { validUntil } = activateSubscription(userId, payment.plan_code, payment.id, 'razorpay');

  // Receipt notification — best effort, must not fail the request.
  try {
    createNotification({
      userId,
      type: 'payment',
      title: 'Payment successful',
      body: `Your ${payment.plan_code} plan is now active.`,
      relatedEntityType: 'payment',
      relatedEntityId: payment.id,
      actionUrl: '/app/billing',
    });
  } catch (err) {
    logger.warn({ err }, 'payment receipt notification failed');
  }

  writeAudit({
    actorType: 'user',
    actorId: userId,
    action: 'payment.verified',
    entityType: 'payment',
    entityId: payment.id,
    after: { planCode: payment.plan_code, validUntil },
    req,
  });

  ok(res, { status: 'paid', subscription: getSubscriptionView(userId) });
});

// ---------------------------------------------------------------------------
// WEBHOOK (anonymous; raw-body HMAC; idempotent; always 200 fast)
// ---------------------------------------------------------------------------

interface WebhookPayload {
  event?: string;
  payload?: {
    payment?: { entity?: { order_id?: string; id?: string; method?: string } };
    order?: { entity?: { id?: string } };
  };
}

/** POST /payments/webhook — Razorpay server-to-server callback. */
export const webhook: RequestHandler = (req, res) => {
  // Always acknowledge quickly; never leak processing errors back to Razorpay.
  const ack = () => res.status(200).json({ ok: true });

  try {
    const raw = req.rawBody ?? Buffer.from('');
    const signature = req.header('x-razorpay-signature') ?? '';
    const eventId = req.header('x-razorpay-event-id') ?? '';

    const signatureOk = razorpay.verifyWebhookSignature(raw, signature);
    if (!signatureOk) {
      logger.warn('razorpay webhook: bad signature');
      return ack();
    }

    let body: WebhookPayload = {};
    try {
      body = JSON.parse(raw.toString('utf8')) as WebhookPayload;
    } catch {
      logger.warn('razorpay webhook: unparseable body');
      return ack();
    }

    const eventType = body.event ?? 'unknown';
    const orderId =
      body.payload?.payment?.entity?.order_id ?? body.payload?.order?.entity?.id ?? null;
    const rzpPaymentId = body.payload?.payment?.entity?.id ?? null;
    const method = body.payload?.payment?.entity?.method ?? null;

    const payment = orderId ? getPaymentByOrderId(orderId) : undefined;

    // Idempotency: key by Razorpay's event id (fall back to order id if absent).
    const dedupeKey = eventId || (orderId ? `order:${orderId}:${eventType}` : `evt:${Date.now()}`);
    const isNew = recordWebhookEvent({
      eventId: dedupeKey,
      paymentId: payment?.id ?? null,
      eventType,
      signatureOk,
      payloadJson: raw.toString('utf8'),
    });
    if (!isNew) return ack(); // already processed

    if ((eventType === 'payment.captured' || eventType === 'order.paid') && payment) {
      if (payment.status !== 'paid') {
        markPaymentPaid(payment.id, {
          razorpayPaymentId: rzpPaymentId,
          method,
          rawWebhookJson: raw.toString('utf8'),
        });
        activateSubscription(payment.user_id, payment.plan_code, payment.id, 'razorpay');

        try {
          createNotification({
            userId: payment.user_id,
            type: 'payment',
            title: 'Payment successful',
            body: `Your ${payment.plan_code} plan is now active.`,
            relatedEntityType: 'payment',
            relatedEntityId: payment.id,
            actionUrl: '/app/billing',
          });
        } catch (err) {
          logger.warn({ err }, 'payment webhook notification failed');
        }
      }
    }

    markWebhookProcessed(dedupeKey, payment?.id ?? null);
    return ack();
  } catch (err) {
    logger.error({ err }, 'razorpay webhook handler error');
    // Still acknowledge so Razorpay does not hammer retries; we have the row logged.
    return ack();
  }
};
