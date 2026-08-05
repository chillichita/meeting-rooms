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

  let sub: number;
  try {
    sub = (jwt.verify(token, JWT_SECRET) as unknown as { sub: number }).sub;
  } catch {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const user = selectUserById.get(sub) as AuthUser | undefined;
  if (!user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  (req as AuthedRequest).user = user;
  next();
}
