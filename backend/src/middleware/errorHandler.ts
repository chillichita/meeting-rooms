import type { ErrorRequestHandler } from 'express';
import { BookingError } from '../services/bookingService.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof BookingError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  // http-errors convention: body-parser and friends set err.status (e.g. 400
  // for malformed JSON). Honour it instead of replying with a misleading 500.
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ message: 'Bad request' });
    return;
  }
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
};
