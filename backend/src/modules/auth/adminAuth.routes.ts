import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { requireRole } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { adminLoginSchema, refreshSchema } from './auth.schema';
import { adminLogin, adminRefresh, adminLogout, adminMe } from './adminAuth.controller';

const router = Router();

router.post('/login', authLimiter, validate(adminLoginSchema), adminLogin);
router.post('/refresh', validate(refreshSchema), adminRefresh);
router.post('/logout', requireRole(), adminLogout);
router.get('/me', requireRole(), adminMe);

export default router;
