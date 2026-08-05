import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { SqliteError } from 'better-sqlite3';
import { db } from '../db.js';
import { JWT_SECRET } from '../config.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

const registerSchema = z.object({
  name: z.string({ error: 'Enter your name.' }).trim().min(1, 'Enter your name.'),
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be 8–72 characters.')
    .max(72, 'Password must be 8–72 characters.'),
});

const insertUser = db.prepare(
  'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
);
const selectUser = db.prepare('SELECT id, name, email FROM users WHERE id = ?');

const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

const selectUserByEmail = db.prepare(
  'SELECT id, name, email, password_hash FROM users WHERE email = ?'
);
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const router = Router();

router.post('/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res
      .status(400)
      .json({ field: issue.path[0] ?? 'body', message: issue.message });
  }

  const { name, email, password } = parsed.data;
  const passwordHash = bcrypt.hashSync(password, 10);

  let userId: number | bigint;
  try {
    userId = insertUser.run(name, email, passwordHash).lastInsertRowid;
  } catch (err) {
    // UNIQUE constraint on email is the atomic guard: a race between two
    // registrations with the same email can only lose here, never 500.
    if (err instanceof SqliteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res
        .status(409)
        .json({ field: 'email', message: 'An account with this email already exists.' });
    }
    throw err;
  }

  res.status(201).json(selectUser.get(userId));
});

router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res
      .status(400)
      .json({ field: issue.path[0] ?? 'body', message: issue.message });
  }

  const { email, password } = parsed.data;
  const user = selectUserByEmail.get(email) as
    | { id: number; name: string; email: string; password_hash: string }
    | undefined;

  // Single generic message: don't reveal whether the email or the password was wrong.
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res
      .status(401)
      .json({ field: 'password', message: 'Incorrect email or password.' });
  }

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // dev over http; set true behind https
    maxAge: COOKIE_MAX_AGE,
  });
  res.json({ id: user.id, name: user.name, email: user.email });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json((req as AuthedRequest).user);
});

export default router;
