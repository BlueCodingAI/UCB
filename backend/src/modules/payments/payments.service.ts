import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now, DAY } from '../../lib/time';
import { mapPlan } from '../../lib/mappers';
import { Errors } from '../../lib/errors';
import type { PlanCode, PlanDTO } from '../../types';

// ---------------------------------------------------------------------------
// Row shapes (snake_case as stored)
// ---------------------------------------------------------------------------

interface PlanRow {
  code: PlanCode;
  name: string;
  description: string | null;
  price_paise: number;
  currency: string;
  validity_days: number;
  cutoff_date: number | null;
  feat_profile_memory: number;
  feat_next_steps: number;
  feat_counselling_assist: number;
  feat_one_to_one: number;
  feat_in_person: number;
  feat_voice: number;
  daily_chat_limit: number | null;
  is_active: number;
  sort_order: number;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_code: PlanCode;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  price_paise_paid: number;
  starts_at: number;
  valid_until: number;
  cancelled_at: number | null;
  payment_id: string | null;
  source: 'razorpay' | 'admin_grant' | 'migration';
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface PaymentRow {
  id: string;
  user_id: string;
  plan_code: PlanCode;
  amount_paise: number;
  currency: string;
  status: 'created' | 'attempted' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  method: string | null;
  refund_amount_paise: number;
  failure_reason: string | null;
  receipt: string | null;
  raw_webhook_json: string | null;
  paid_at: number | null;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface PaymentDTO {
  id: string;
  planCode: PlanCode;
  amountPaise: number;
  currency: string;
  status: PaymentRow['status'];
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  method: string | null;
  refundAmountPaise: number;
  failureReason: string | null;
  receipt: string | null;
  paidAt: number | null;
  createdAt: number;
}

export interface SubscriptionDTO {
  id: string;
  planCode: PlanCode;
  status: SubscriptionRow['status'];
  pricePaisePaid: number;
  startsAt: number;
  validUntil: number;
  cancelledAt: number | null;
  source: SubscriptionRow['source'];
  createdAt: number;
}

function mapPayment(r: PaymentRow): PaymentDTO {
  return {
    id: r.id,
    planCode: r.plan_code,
    amountPaise: r.amount_paise,
    currency: r.currency,
    status: r.status,
    razorpayOrderId: r.razorpay_order_id ?? null,
    razorpayPaymentId: r.razorpay_payment_id ?? null,
    method: r.method ?? null,
    refundAmountPaise: r.refund_amount_paise,
    failureReason: r.failure_reason ?? null,
    receipt: r.receipt ?? null,
    paidAt: r.paid_at ?? null,
    createdAt: r.created_at,
  };
}

function mapSubscription(r: SubscriptionRow): SubscriptionDTO {
  return {
    id: r.id,
    planCode: r.plan_code,
    status: r.status,
    pricePaisePaid: r.price_paise_paid,
    startsAt: r.starts_at,
    validUntil: r.valid_until,
    cancelledAt: r.cancelled_at ?? null,
    source: r.source,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Plan / subscription reads
// ---------------------------------------------------------------------------

export function getPlanRow(code: string): PlanRow | undefined {
  return db.prepare('SELECT * FROM plans WHERE code = ?').get(code) as PlanRow | undefined;
}

/** Active plans, sorted for display. */
export function listActivePlans(): PlanDTO[] {
  const rows = db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC').all() as PlanRow[];
  return rows.map(mapPlan);
}

/** The user's current active subscription row, if any (and not expired). */
export function getActiveSubscription(userId: string): SubscriptionRow | undefined {
  return db
    .prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'`)
    .get(userId) as SubscriptionRow | undefined;
}

/**
 * Current subscription view for /subscription: the active paid subscription with
 * its plan, or a freemium default if none is active.
 */
export function getSubscriptionView(userId: string): {
  subscription: SubscriptionDTO | null;
  plan: PlanDTO | null;
  validUntil: number | null;
} {
  const sub = getActiveSubscription(userId);
  if (sub && sub.valid_until > now()) {
    const plan = getPlanRow(sub.plan_code);
    return {
      subscription: mapSubscription(sub),
      plan: plan ? mapPlan(plan) : null,
      validUntil: sub.valid_until,
    };
  }
  const freemium = getPlanRow('freemium');
  return {
    subscription: null,
    plan: freemium ? mapPlan(freemium) : null,
    validUntil: null,
  };
}

/** A user's payments, newest first. */
export function listPayments(userId: string): PaymentDTO[] {
  const rows = db
    .prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as PaymentRow[];
  return rows.map(mapPayment);
}

// ---------------------------------------------------------------------------
// Payment row helpers
// ---------------------------------------------------------------------------

export function getPaymentByOrderId(orderId: string): PaymentRow | undefined {
  return db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(orderId) as PaymentRow | undefined;
}

export function createPaymentRecord(input: {
  userId: string;
  planCode: PlanCode;
  amountPaise: number;
  currency: string;
  razorpayOrderId: string;
  receipt: string;
}): string {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO payments (id, user_id, plan_code, amount_paise, currency, status, razorpay_order_id, receipt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.planCode,
    input.amountPaise,
    input.currency,
    input.razorpayOrderId,
    input.receipt,
    ts,
    ts,
  );
  return id;
}

/** Mark a payment paid (idempotent — no-op if already paid). Returns the updated row. */
export function markPaymentPaid(
  paymentId: string,
  opts: { razorpayPaymentId?: string | null; signature?: string | null; method?: string | null; rawWebhookJson?: string | null } = {},
): PaymentRow | undefined {
  const ts = now();
  db.prepare(
    `UPDATE payments
       SET status = 'paid',
           paid_at = COALESCE(paid_at, ?),
           razorpay_payment_id = COALESCE(?, razorpay_payment_id),
           razorpay_signature = COALESCE(?, razorpay_signature),
           method = COALESCE(?, method),
           raw_webhook_json = COALESCE(?, raw_webhook_json),
           updated_at = ?
     WHERE id = ? AND status <> 'paid'`,
  ).run(
    ts,
    opts.razorpayPaymentId ?? null,
    opts.signature ?? null,
    opts.method ?? null,
    opts.rawWebhookJson ?? null,
    ts,
    paymentId,
  );
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as PaymentRow | undefined;
}

// ---------------------------------------------------------------------------
// Webhook idempotency
// ---------------------------------------------------------------------------

/**
 * Record a webhook event keyed by Razorpay's delivery id. Returns true if this is
 * the first time we've seen it (caller should process), false if already seen.
 */
export function recordWebhookEvent(input: {
  eventId: string;
  paymentId: string | null;
  eventType: string;
  signatureOk: boolean;
  payloadJson: string;
}): boolean {
  try {
    db.prepare(
      `INSERT INTO payment_webhook_events (id, payment_id, event_type, signature_ok, payload_json, received_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventId,
      input.paymentId,
      input.eventType,
      input.signatureOk ? 1 : 0,
      input.payloadJson,
      now(),
    );
    return true;
  } catch {
    // PRIMARY KEY conflict → already processed.
    return false;
  }
}

export function markWebhookProcessed(eventId: string, paymentId: string | null): void {
  db.prepare('UPDATE payment_webhook_events SET processed_at = ?, payment_id = COALESCE(?, payment_id) WHERE id = ?').run(
    now(),
    paymentId,
    eventId,
  );
}

// ---------------------------------------------------------------------------
// Subscription activation (INTERNAL CONTRACT)
// ---------------------------------------------------------------------------

/**
 * Activate a paid subscription for a user.
 * - validUntil = min(now + validity_days*DAY, plan.cutoff_date if set)
 * - expires any currently-active subscription
 * - inserts a new active subscriptions row
 * - updates users.current_plan_code + plan_valid_until
 */
export function activateSubscription(
  userId: string,
  planCode: PlanCode,
  paymentId?: string | null,
  source: 'razorpay' | 'admin_grant' = 'razorpay',
): { validUntil: number } {
  const plan = getPlanRow(planCode);
  if (!plan) throw Errors.notFound('Plan not found');

  const ts = now();
  let validUntil = ts + plan.validity_days * DAY;
  if (plan.cutoff_date != null && plan.cutoff_date < validUntil) {
    validUntil = plan.cutoff_date;
  }

  const tx = db.transaction(() => {
    // Expire any current active subscription so the unique-active index is free.
    db.prepare(
      `UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE user_id = ? AND status = 'active'`,
    ).run(ts, userId);

    db.prepare(
      `INSERT INTO subscriptions
         (id, user_id, plan_code, status, price_paise_paid, starts_at, valid_until, payment_id, source, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), userId, planCode, plan.price_paise, ts, validUntil, paymentId ?? null, source, ts, ts);

    db.prepare('UPDATE users SET current_plan_code = ?, plan_valid_until = ?, updated_at = ? WHERE id = ?').run(
      planCode,
      validUntil,
      ts,
      userId,
    );
  });
  tx();

  return { validUntil };
}
