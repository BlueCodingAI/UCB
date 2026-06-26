import { Router } from 'express';
import adminUsersRouter from './adminUsers.routes';
import adminKbRouter from './adminKb.routes';
import adminPlansRouter from './adminPlans.routes';
import adminBroadcastsRouter from './adminBroadcasts.routes';
import adminBannersRouter from './adminBanners.routes';
import adminCounsellingRouter from './adminCounselling.routes';
import adminDashboardRouter from './adminDashboard.routes';

/**
 * Aggregates every admin sub-router under /api/v1/admin.
 * Each sub-router self-applies its own requireRole(...) guard, so role
 * granularity (e.g. counsellors → counselling only) is preserved.
 * NOTE: /admin/auth is mounted separately in routes.ts (it must be reachable
 * without an admin session).
 */
const router = Router();

router.use('/users', adminUsersRouter);
router.use('/kb', adminKbRouter);
router.use('/plans', adminPlansRouter);
router.use('/broadcasts', adminBroadcastsRouter);
router.use('/banners', adminBannersRouter);
router.use('/counselling', adminCounsellingRouter);
// Dashboard / audit-logs / chat-logs live at the bare /admin prefix — mount last.
router.use('/', adminDashboardRouter);

export default router;
