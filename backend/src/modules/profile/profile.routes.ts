import { Router } from 'express';
import { requireUser, requireFeature } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { updateProfileBody, updateCapProfileBody } from './profile.schema';
import {
  getProfile,
  updateProfile,
  getCapProfile,
  updateCapProfile,
  deleteCapProfile,
} from './profile.controller';

const router = Router();

// Account basics — available to all authenticated users.
router.get('/', requireUser, getProfile);
router.put('/', requireUser, validate({ body: updateProfileBody }), updateProfile);

// CAP profile memory — gated behind the profile_memory feature (paid plans).
router.get('/cap', requireFeature('profile_memory'), getCapProfile);
router.put('/cap', requireFeature('profile_memory'), validate({ body: updateCapProfileBody }), updateCapProfile);
router.delete('/cap', requireFeature('profile_memory'), deleteCapProfile);

export default router;
