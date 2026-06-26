import { Router } from 'express';
import { requireUser, requireFeature } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { rateLimit } from '../../middleware/rateLimit';
import { audioUpload } from '../../middleware/upload';
import { voiceLangBody, ttsBody } from './voice.schema';
import { stt, tts, ask, voices } from './voice.controller';

const router = Router();

// All voice endpoints require an authenticated user whose plan includes the voice feature.
router.use(requireUser, requireFeature('voice'));

const voiceLimiter = rateLimit({ points: 30, durationSec: 60, keyPrefix: 'voice' });

router.post(
  '/stt',
  voiceLimiter,
  audioUpload.single('audio'),
  validate({ body: voiceLangBody }),
  stt,
);

router.post('/tts', voiceLimiter, validate({ body: ttsBody }), tts);

router.post(
  '/ask',
  voiceLimiter,
  audioUpload.single('audio'),
  validate({ body: voiceLangBody }),
  ask,
);

router.get('/voices', voices);

export default router;
