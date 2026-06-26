import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { dashboard, auditLogs, chatLogs } from './adminDashboard.controller';

const router = Router();

// Admin-only analytics/audit read side. Mounted at /api/v1/admin.
router.use(requireRole('admin'));

router.get('/dashboard', dashboard);
router.get('/audit-logs', auditLogs);
router.get('/chat-logs', chatLogs);

export default router;
