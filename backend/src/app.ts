import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js'; // create tables on start
import authRouter from './routes/auth.js';
import roomsRouter from './routes/rooms.js';
import bookingsRouter from './routes/bookings.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/bookings', bookingsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Container/production mode: serve the built SPA from the same origin as the
// API (one service, no CORS). Skipped in dev — dist doesn't exist there and
// the Vite dev server owns the app.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: non-API routes return index.html. Express 5 dropped the
  // bare '*' wildcard, hence the regex. Must run before the JSON 404 below.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Unknown routes -> JSON 404 (before the error handler).
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Central error handler: BookingError statuses, 500 fallback.
app.use(errorHandler);
