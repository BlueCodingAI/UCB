import { Router } from 'express';
import { requireFeature } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  listSlotsQuery,
  createRequestBody,
  idParam,
  bookBody,
} from './counselling.schema';
import {
  getSlots,
  postRequest,
  getRequests,
  getRequest,
  postBook,
  postCancel,
} from './counselling.controller';

const router = Router();

// All counselling endpoints require the paid 'counselling_assist' feature.
router.use(requireFeature('counselling_assist'));

router.get('/slots', validate({ query: listSlotsQuery }), getSlots);

router.post('/requests', validate({ body: createRequestBody }), postRequest);
router.get('/requests', getRequests);
router.get('/requests/:id', validate({ params: idParam }), getRequest);
router.post('/requests/:id/book', validate({ params: idParam, body: bookBody }), postBook);

router.post('/appointments/:id/cancel', validate({ params: idParam }), postCancel);

export default router;
