import { Router } from 'express';
import { requireFeature } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listQuerySchema, stepParamsSchema, updateStatusSchema } from './recommendations.schema';
import { list, updateStatus, refresh } from './recommendations.controller';

const router = Router();

// All recommendation endpoints require the paid 'next_steps' feature.
router.use(requireFeature('next_steps'));

/** GET /recommendations — list recommendations for the user (optional status filter). */
router.get('/', validate({ query: listQuerySchema }), list);

/** POST /recommendations/steps/:stepId/status — update a step's status. */
router.post(
  '/steps/:stepId/status',
  validate({ params: stepParamsSchema, body: updateStatusSchema }),
  updateStatus,
);

/** POST /recommendations/refresh — regenerate next-step recommendations. */
router.post('/refresh', refresh);

export default router;
