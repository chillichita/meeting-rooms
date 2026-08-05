import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fromZonedTime } from 'date-fns-tz';
import type Database from 'better-sqlite3';
import type { BookingConflictError, BookingError, NewBooking } from '../../services/bookingService.js';

const dir = mkdtempSync(path.join(tmpdir(), 'mr-booking-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');

let db: InstanceType<typeof Database>;
let createBooking: (userId: number, input: NewBooking) => unknown;
let BookingConflictErrorType: typeof BookingConflictError;
let BookingErrorType: typeof BookingError;

// Kyiv wall-clock slot as UTC instant, same tzdb as production code.
const slot = (h: number, m = 0) =>
  fromZonedTime(new Date(2026, 7, 6, h, m), 'Europe/Kyiv').toISOString();
const NEXT_DAY = (h: number) =>
  fromZonedTime(new Date(2026, 7, 7, h, 0), 'Europe/Kyiv').toISOString();

const VALID: NewBooking = { roomId: 1, title: 'Planning', startAt: slot(10), endAt: slot(11) };

beforeAll(async () => {
  const dbModule = await import('../../db.js');
  db = dbModule.db;
  const svc = await import('../../services/bookingService.js');
  createBooking = svc.createBooking;
  BookingConflictErrorType = svc.BookingConflictError;
  BookingErrorType = svc.BookingError;

  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Mercury', 2, 6)").run();
  db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('Tester', 't@example.com', 'x')").run();
});

afterAll(() => {
  db.close(); // release the WAL file handles before removing the temp dir
  rmSync(dir, { recursive: true, force: true });
});

describe('createBooking — overlap rules (spec: touching, partial, full, adjacent days)', () => {
  it('creates the first booking', () => {
    const booking = createBooking(1, VALID) as { id: number; title: string };
    expect(booking.id).toBe(1);
    expect(booking.title).toBe('Planning');
  });

  it('allows a touching booking (end == start)', () => {
    expect(() => createBooking(1, { ...VALID, startAt: slot(11), endAt: slot(12) })).not.toThrow();
  });

  it('rejects a partial overlap', () => {
    expect(() => createBooking(1, { ...VALID, startAt: slot(10, 30), endAt: slot(11, 30) })).toThrowError(
      BookingConflictErrorType
    );
  });

  it('rejects a full overlap (same slot)', () => {
    expect(() => createBooking(1, VALID)).toThrowError(BookingConflictErrorType);
  });

  it('rejects a booking containing an existing one', () => {
    expect(() => createBooking(1, { ...VALID, startAt: slot(9, 30), endAt: slot(11, 30) })).toThrowError(
      BookingConflictErrorType
    );
  });

  it('allows the same time on an adjacent day', () => {
    expect(() => createBooking(1, { ...VALID, startAt: NEXT_DAY(10), endAt: NEXT_DAY(11) })).not.toThrow();
  });

  it('leaves exactly one row per conflicting slot', () => {
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM bookings WHERE room_id = 1 AND start_at = ?')
      .get(slot(10)) as { n: number };
    expect(count.n).toBe(1);
  });
});

describe('createBooking — validation passthrough', () => {
  it('rejects a booking outside office hours', () => {
    expect(() => createBooking(1, { ...VALID, startAt: slot(19), endAt: slot(20) })).toThrowError(
      /after office hours/
    );
  });

  it('rejects an empty title', () => {
    expect(() => createBooking(1, { ...VALID, title: '   ' })).toThrowError(/Title/);
  });

  it('rejects an unknown room', () => {
    expect(() => createBooking(1, { ...VALID, roomId: 999 })).toThrowError(/Room not found/);
  });
});
