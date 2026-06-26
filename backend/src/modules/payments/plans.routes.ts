import { Router } from 'express';
import { requireUser } from '../../middleware/auth';
import { getPlans, getSubscription } from './payments.controller';

const router = Router();

/** Public catalogue of active plans (no auth). */
router.get('/', getPlans);

/** The authenticated user's current subscription (freemium default). */
router.get('/subscription', requireUser, getSubscription);

export default router;
