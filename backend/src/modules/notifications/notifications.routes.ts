import { Router } from 'express';
import { requireUser } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listQuery, idParam, updatePreferences as updatePreferencesSchema } from './notifications.schema';
import * as controller from './notifications.controller';
// Importing the service registers its job handlers (broadcast_send, reminder_dispatch,
// notification_send) at boot as a side effect.
import './notifications.service';

const router = Router();

// All notification endpoints require an authenticated end-user.
router.use(requireUser);

router.get('/', validate({ query: listQuery }), controller.list);
router.get('/unread-count', controller.unreadCount);
router.get('/preferences', controller.getPreferences);
router.put('/preferences', validate({ body: updatePreferencesSchema }), controller.updatePreferences);
router.post('/read-all', controller.markAllRead);
router.post('/:id/read', validate({ params: idParam }), controller.markRead);

export default router;
