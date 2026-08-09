import { db } from '../db.js';
import { validateBookingTimes } from './bookingValidation.js';

export class BookingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export class BookingConflictError extends BookingError {
  constructor(message: string) {
    super(message, 409);
  }
}

export interface NewBooking {
  roomId: number;
  title: string;
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
}

const roomExists = db.prepare('SELECT 1 FROM rooms WHERE id = ?');
const userVerified = db.prepare('SELECT email_verified FROM users WHERE id = ?');
const selectBooking = db.prepare(
  'SELECT id, user_id, room_id, title, start_at, end_at FROM bookings WHERE id = ?'
);

// The overlap check lives INSIDE the INSERT: SQLite executes a single
// statement atomically, so two concurrent requests for the same slot cannot
// both pass the check — the second one inserts 0 rows and gets a conflict.
const insertBooking = db.prepare(`
  INSERT INTO bookings (user_id, room_id, title, start_at, end_at)
  SELECT @userId, @roomId, @title, @startAt, @endAt
  WHERE NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE room_id = @roomId
      AND start_at < @endAt
      AND end_at > @startAt
  )
`);

export function createBooking(userId: number, input: NewBooking) {
  // Spec: booking is not allowed before email verification.
  const verified = (userVerified.get(userId) as { email_verified: number } | undefined)
    ?.email_verified;
  if (!verified) {
    throw new BookingError('Please verify your email before booking', 403);
  }

  const title = input.title.trim();
  if (title.length < 1 || title.length > 100) {
    throw new BookingError('Title must be 1-100 characters');
  }

  const reason = validateBookingTimes(input.startAt, input.endAt);
  if (reason) {
    throw new BookingError(reason);
  }

  if (!roomExists.get(input.roomId)) {
    throw new BookingError('Room not found', 404);
  }

  const result = insertBooking.run({
    userId,
    roomId: input.roomId,
    title,
    startAt: input.startAt,
    endAt: input.endAt,
  });

  if (result.changes === 0) {
    throw new BookingConflictError('Slot already booked');
  }

  return selectBooking.get(result.lastInsertRowid);
}
