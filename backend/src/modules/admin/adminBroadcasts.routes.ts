import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createBroadcastBody,
  broadcastIdParams,
  listBroadcastsQuery,
} from './adminBroadcasts.schema';
import {
  createBroadcast,
  listBroadcasts,
  getBroadcast,
  cancelBroadcast,
} from './adminBroadcasts.controller';

const router = Router();

// All broadcast routes require an admin.
router.use(requireRole('admin'));

router.post('/', validate({ body: createBroadcastBody }), createBroadcast);
router.get('/', validate({ query: listBroadcastsQuery }), listBroadcasts);
router.get('/:id', validate({ params: broadcastIdParams }), getBroadcast);
router.post('/:id/cancel', validate({ params: broadcastIdParams }), cancelBroadcast);

export default router;
