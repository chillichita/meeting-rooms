import { db } from '../db.js';
import { validateBookingTimes } from './bookingValidation.js';

export class BookingError extends Error {}
export class BookingConflictError extends BookingError {}

export interface NewBooking {
  roomId: number;
  title: string;
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
}

const roomExists = db.prepare('SELECT 1 FROM rooms WHERE id = ?');
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
  const title = input.title.trim();
  if (title.length < 1 || title.length > 100) {
    throw new BookingError('Title must be 1-100 characters');
  }

  const reason = validateBookingTimes(input.startAt, input.endAt);
  if (reason) {
    throw new BookingError(reason);
  }

  if (!roomExists.get(input.roomId)) {
    throw new BookingError('Room not found');
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
