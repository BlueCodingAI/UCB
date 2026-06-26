import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { list, update } from './adminPlans.controller';

const router = Router();

// Admin-only plan management. Mounted at /api/v1/admin/plans.
router.use(requireRole('admin'));

const codeParams = z.object({ code: z.enum(['freemium', 'premium', 'super_premium']) });

const updatePlanBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    pricePaise: z.coerce.number().int().min(0).optional(),
    validityDays: z.coerce.number().int().min(1).optional(),
    cutoffDate: z.coerce.number().int().positive().nullable().optional(),
    dailyChatLimit: z.coerce.number().int().min(0).nullable().optional(),
    isActive: z.boolean().optional(),
    featProfileMemory: z.boolean().optional(),
    featNextSteps: z.boolean().optional(),
    featCounsellingAssist: z.boolean().optional(),
    featOneToOne: z.boolean().optional(),
    featInPerson: z.boolean().optional(),
    featVoice: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

router.get('/', list);
router.put('/:code', validate({ params: codeParams, body: updatePlanBody }), update);

export default router;
