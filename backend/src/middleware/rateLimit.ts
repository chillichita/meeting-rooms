import { rateLimit } from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20, // 20 attempts per IP — generous for humans, painful for brute force
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in 15 minutes.' },
  skip: () => process.env.NODE_ENV === 'test',
});
