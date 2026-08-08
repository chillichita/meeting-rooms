import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { errorHandler } from '../middleware/errorHandler.js';
import { BookingError } from '../services/bookingService.js';

const mockRes = () => {
  const status = vi.fn();
  const json = vi.fn();
  const res = { status, json } as unknown as Response;
  status.mockReturnValue(res);
  return res;
};
const noop = () => {};

describe('errorHandler', () => {
  it('maps BookingError to its status and message', () => {
    const res = mockRes();
    errorHandler(new BookingError('Outside office hours', 400), {} as never, res, noop);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Outside office hours' });
  });

  it('honours a 4xx status from http-errors style errors', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Unexpected token'), { status: 400 });
    errorHandler(err, {} as never, res, noop);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Bad request' });
  });

  it('falls back to 500 without leaking details for generic errors', () => {
    const res = mockRes();
    errorHandler(new Error('boom: SELECT * FROM users'), {} as never, res, noop);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
  });
});
