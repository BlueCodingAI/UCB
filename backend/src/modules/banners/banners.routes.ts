import { Router } from 'express';
import { authOptional } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { serveQuery, idParams, trackBody } from './banners.schema';
import { serve, recordImpression, recordClick } from './banners.controller';

const router = Router();

// Public/anonymous; authOptional attaches req.auth when a token is present.
router.get('/', validate({ query: serveQuery }), serve);

router.post(
  '/:id/impression',
  authOptional,
  validate({ params: idParams, body: trackBody }),
  recordImpression,
);

router.post(
  '/:id/click',
  authOptional,
  validate({ params: idParams, body: trackBody }),
  recordClick,
);

export default router;
