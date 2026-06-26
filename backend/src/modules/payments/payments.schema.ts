import { z } from 'zod';
import { PLAN_CODES } from '../../types';

/** Plan codes that a user can purchase (freemium is not purchasable). */
const purchasablePlan = z.enum(['premium', 'super_premium']);

/** POST /payments/order — start a checkout for a paid plan. */
export const createOrderSchema = z.object({
  planCode: purchasablePlan,
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** POST /payments/verify — confirm a Razorpay checkout handler result. */
export const verifyPaymentSchema = z.object({
  orderId: z.string().trim().min(1),
  paymentId: z.string().trim().min(1),
  signature: z.string().trim().min(1),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

// Re-exported for callers that want the full plan-code union.
export const anyPlanCode = z.enum(PLAN_CODES as [string, ...string[]]);
