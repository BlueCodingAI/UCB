import { Router } from 'express';
import { requireUser } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { rateLimit } from '../../middleware/rateLimit';
import { createOrderSchema, verifyPaymentSchema } from './payments.schema';
import { createOrder, verifyPayment, webhook, getPayments } from './payments.controller';

const router = Router();

// Modest limiter on money-moving endpoints to discourage abuse.
const payLimiter = rateLimit({ points: 20, durationSec: 60, keyPrefix: 'payments' });

/** Razorpay server-to-server webhook (anonymous; signed raw body). */
router.post('/webhook', webhook);

/** Start a checkout: create a Razorpay order for a paid plan. */
router.post('/order', requireUser, payLimiter, validate({ body: createOrderSchema }), createOrder);

/** Confirm a checkout result and activate the subscription. */
router.post('/verify', requireUser, payLimiter, validate({ body: verifyPaymentSchema }), verifyPayment);

/** The authenticated user's payment history. */
router.get('/', requireUser, getPayments);

export default router;
