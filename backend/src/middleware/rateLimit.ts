import { rateLimit } from 'express-rate-limit';

// Auth endpoints only: brute-force protection on /login and /register.
// Skipped under test so the integration suites (dozens of logins from a
// single IP) don't trip it — vitest sets NODE_ENV=test via vitest.config.ts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20, // 20 attempts per IP — generous for humans, painful for brute force
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in 15 minutes.' },
  skip: () => process.env.NODE_ENV === 'test',
});
