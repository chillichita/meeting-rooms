import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { OFFICE_TIME_ZONE, validateBookingTimes } from './bookingValidation.js';

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
  /** 1 or undefined = single booking; 2..52 = weekly series. */
  repeatCount?: number;
}

const roomExists = db.prepare('SELECT 1 FROM rooms WHERE id = ?');
const userVerified = db.prepare('SELECT email_verified FROM users WHERE id = ?');
const selectBooking = db.prepare(
  'SELECT id, user_id, room_id, title, start_at, end_at, series_id FROM bookings WHERE id = ?'
);

// The overlap check lives INSIDE the INSERT: SQLite executes a single
// statement atomically, so two concurrent requests for the same slot cannot
// both pass the check — the second one inserts 0 rows and gets a conflict.
const insertBooking = db.prepare(`
  INSERT INTO bookings (user_id, room_id, title, start_at, end_at, series_id)
  SELECT @userId, @roomId, @title, @startAt, @endAt, @seriesId
  WHERE NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE room_id = @roomId
      AND start_at < @endAt
      AND end_at > @startAt
  )
`);

const updateSeriesId = db.prepare('UPDATE bookings SET series_id = ? WHERE id = ?');
const maxSeriesStart = db.prepare('SELECT MAX(start_at) AS max_start FROM bookings WHERE series_id = ?');
const deleteSeries = db.prepare('DELETE FROM bookings WHERE series_id = ? AND user_id = ?');

// +7 days in Kyiv wall time, not instant arithmetic: keeping "every Tuesday
// 10:00" stable across DST (Europe/Kyiv switches at 03:00 local, outside
// office hours, so bookings never span a transition and durations hold).
export function addWeekKyiv(iso: string): string {
  const wall = toZonedTime(iso, OFFICE_TIME_ZONE);
  wall.setDate(wall.getDate() + 7);
  return fromZonedTime(wall, OFFICE_TIME_ZONE).toISOString();
}

const fmtKyivDate = new Intl.DateTimeFormat('en-US', {
  timeZone: OFFICE_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

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

  // Series: all instances share one series_id; a single booking keeps NULL.
  const repeatCount = Math.max(1, input.repeatCount ?? 1);
  const seriesId = repeatCount > 1 ? randomUUID() : null;

  // All-or-nothing: if any weekly instance conflicts, the whole series rolls
  // back and the message names the exact conflicting date.
  let firstId: number | bigint | undefined;
  const insertSeries = db.transaction(() => {
    let startAt = input.startAt;
    let endAt = input.endAt;
    for (let i = 0; i < repeatCount; i++) {
      const result = insertBooking.run({ userId, roomId: input.roomId, title, startAt, endAt, seriesId });
      if (result.changes === 0) {
        // For a series, name the conflicting week; single bookings keep the
        // plain message the API contract tests expect.
        throw new BookingConflictError(
          repeatCount > 1
            ? `Slot already booked on ${fmtKyivDate.format(new Date(startAt))}`
            : 'Slot already booked'
        );
      }
      if (firstId === undefined) firstId = result.lastInsertRowid;
      startAt = addWeekKyiv(startAt);
      endAt = addWeekKyiv(endAt);
    }
  });
  insertSeries();

  return selectBooking.get(firstId as number);
}

/**
 * Turn a booking into a recurring series, or extend an existing one:
 * creates `count` new weekly instances after the series' last occurrence.
 * Returns the number of rows created.
 */
export function repeatBooking(userId: number, bookingId: number, count: number): number {
  const booking = selectBooking.get(bookingId) as
    | { id: number; user_id: number; title: string; start_at: string; end_at: string; series_id: string | null }
    | undefined;
  if (!booking) {
    throw new BookingError('Booking not found', 404);
  }
  if (booking.user_id !== userId) {
    throw new BookingError('You can only repeat your own bookings', 403);
  }

  // First repeat of a single booking: it becomes occurrence #1 of the series.
  let seriesId = booking.series_id;
  if (!seriesId) {
    seriesId = randomUUID();
    updateSeriesId.run(seriesId, bookingId);
  }

  // Continue after the series' last occurrence; duration is uniform across
  // the series (every instance is created with the same span).
  const lastStart = (maxSeriesStart.get(seriesId) as { max_start: string }).max_start;
  const durationMs = new Date(booking.end_at).getTime() - new Date(booking.start_at).getTime();
  let startAt = addWeekKyiv(lastStart);
  let endAt = addWeekKyiv(new Date(new Date(lastStart).getTime() + durationMs).toISOString());

  let created = 0;
  const extendSeries = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const result = insertBooking.run({
        userId,
        roomId: booking.room_id,
        title: booking.title,
        startAt: startAt,
        endAt,
        seriesId,
      });
      if (result.changes === 0) {
        throw new BookingConflictError(
          `Slot already booked on ${fmtKyivDate.format(new Date(startAt))}`
        );
      }
      created += 1;
      startAt = addWeekKyiv(startAt);
      endAt = addWeekKyiv(endAt);
    }
  });
  extendSeries();

  return created;
}

/** Cancel every booking of a series. 404 unless the series exists and is ours. */
export function cancelSeries(userId: number, seriesId: string): void {
  const result = deleteSeries.run(seriesId, userId);
  if (result.changes === 0) {
    throw new BookingError('Series not found', 404);
  }
}
