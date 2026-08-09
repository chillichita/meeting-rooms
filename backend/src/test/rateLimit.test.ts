import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from 'express-rate-limit';

// The auth limiter itself is skipped under NODE_ENV=test, so test the
// configuration contract here: 429 status and the { message } shape the
// frontend's api() wrapper expects, on a throwaway app with a tiny limit.
const app = express();
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 2,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many attempts. Try again in 15 minutes.' },
    skip: () => false,
  })
);
app.post('/login', (_req, res) => res.json({ ok: true }));

describe('rate limiter', () => {
  it('allows requests under the limit', async () => {
    const res = await request(app).post('/login');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('blocks the over-limit request with 429 and the frontend message shape', async () => {
    await request(app).post('/login'); // 2nd of the 2 allowed
    const res = await request(app).post('/login'); // 3rd -> blocked
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: 'Too many attempts. Try again in 15 minutes.' });
  });
});
