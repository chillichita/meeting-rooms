import express from 'express';
import cookieParser from 'cookie-parser';
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

// Unknown routes -> JSON 404 (before the error handler).
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Central error handler: BookingError statuses, 500 fallback.
app.use(errorHandler);
