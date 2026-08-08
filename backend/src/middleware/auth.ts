import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { db } from '../db.js';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

export type AuthedRequest = Request & { user: AuthUser };

const selectUserById = db.prepare('SELECT id, name, email FROM users WHERE id = ?');

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token: string | undefined = req.cookies?.token;
  if (!token) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  let payload: { sub?: unknown };
  try {
    // Explicit algorithm allowlist: without it, jsonwebtoken accepts any
    // algorithm the token header declares (algorithm confusion, OWASP).
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: unknown };
  } catch {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  // Validate the payload shape instead of a blind double-cast: sub must be
  // the integer user id we signed (jwt.sign({ sub: user.id }) in routes/auth.ts).
  if (typeof payload.sub !== 'number' || !Number.isInteger(payload.sub)) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const user = selectUserById.get(payload.sub) as AuthUser | undefined;
  if (!user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  (req as AuthedRequest).user = user;
  next();
}
