import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listUsersQuery, userIdParams, updateUserBody, grantPlanBody } from './adminUsers.schema';
import { list, detail, patch, grantPlan, remove } from './adminUsers.controller';

const router = Router();

// Admin-only people management. Mounted at /api/v1/admin/users.
router.use(requireRole('admin'));

router.get('/', validate({ query: listUsersQuery }), list);
router.get('/:id', validate({ params: userIdParams }), detail);
router.patch('/:id', validate({ params: userIdParams, body: updateUserBody }), patch);
router.post('/:id/plan', validate({ params: userIdParams, body: grantPlanBody }), grantPlan);
router.delete('/:id', validate({ params: userIdParams }), remove);

export default router;
