import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { requireUser } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import {
  registerSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordForgotSchema,
  passwordResetSchema,
  emailVerifySchema,
  refreshSchema,
} from './auth.schema';
import {
  register,
  login,
  otpRequest,
  otpVerify,
  refresh,
  logout,
  logoutAll,
  passwordForgot,
  passwordReset,
  emailVerify,
  me,
} from './auth.controller';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);

router.post('/otp/request', authLimiter, validate(otpRequestSchema), otpRequest);
router.post('/otp/verify', authLimiter, validate(otpVerifySchema), otpVerify);

router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout', requireUser, logout);
router.post('/logout-all', requireUser, logoutAll);

router.post('/password/forgot', authLimiter, validate(passwordForgotSchema), passwordForgot);
router.post('/password/reset', authLimiter, validate(passwordResetSchema), passwordReset);

router.post('/email/verify', validate(emailVerifySchema), emailVerify);

router.get('/me', requireUser, me);

export default router;
