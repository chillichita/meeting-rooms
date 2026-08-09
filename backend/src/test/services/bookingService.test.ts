import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type Database from 'better-sqlite3';
import type { BookingConflictError, BookingError, NewBooking } from '../../services/bookingService.js';

const dir = mkdtempSync(path.join(tmpdir(), 'mr-booking-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');

let db: InstanceType<typeof Database>;
let createBooking: (userId: number, input: NewBooking) => unknown;
let repeatBooking: (userId: number, bookingId: number, count: number) => number;
let cancelSeries: (userId: number, seriesId: string) => void;
let addWeekKyiv: (iso: string) => string;
let BookingConflictErrorType: typeof BookingConflictError;
let BookingErrorType: typeof BookingError;

// Kyiv wall-clock slots tomorrow and the day after (same tzdb as production),
// always in the future.
const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);
const DAY_AFTER = new Date(TOMORROW);
DAY_AFTER.setDate(DAY_AFTER.getDate() + 1);
const NEXT_WEEK = new Date(TOMORROW);
NEXT_WEEK.setDate(NEXT_WEEK.getDate() + 7);
const slot = (h: number, m = 0) =>
  fromZonedTime(
    new Date(TOMORROW.getFullYear(), TOMORROW.getMonth(), TOMORROW.getDate(), h, m),
    'Europe/Kyiv',
  ).toISOString();
const nextWeekSlot = (h: number, m = 0) =>
  fromZonedTime(
    new Date(NEXT_WEEK.getFullYear(), NEXT_WEEK.getMonth(), NEXT_WEEK.getDate(), h, m),
    'Europe/Kyiv',
  ).toISOString();
const NEXT_DAY = (h: number) =>
  fromZonedTime(
    new Date(DAY_AFTER.getFullYear(), DAY_AFTER.getMonth(), DAY_AFTER.getDate(), h, 0),
    'Europe/Kyiv',
  ).toISOString();

const VALID: NewBooking = { roomId: 1, title: 'Planning', startAt: slot(10), endAt: slot(11) };

const countBookings = () =>
  (db.prepare('SELECT COUNT(*) AS n FROM bookings').get() as { n: number }).n;

beforeAll(async () => {
  const dbModule = await import('../../db.js');
  db = dbModule.db;
  const svc = await import('../../services/bookingService.js');
  createBooking = svc.createBooking;
  repeatBooking = svc.repeatBooking;
  cancelSeries = svc.cancelSeries;
  addWeekKyiv = svc.addWeekKyiv;
  BookingConflictErrorType = svc.BookingConflictError;
  BookingErrorType = svc.BookingError;

  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Mercury', 2, 6)").run();
  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Saturn', 1, 12)").run();
  db.prepare(
    "INSERT INTO users (name, email, password_hash, email_verified) VALUES ('Tester', 't@example.com', 'x', 1)"
  ).run();
  db.prepare(
    "INSERT INTO users (name, email, password_hash, email_verified) VALUES ('Fresh', 'fresh@example.com', 'x', 0)"
  ).run();
  db.prepare(
    "INSERT INTO users (name, email, password_hash, email_verified) VALUES ('Other', 'other@example.com', 'x', 1)"
  ).run();
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

describe('addWeekKyiv — DST-safe weekly stepping', () => {
  it('keeps 10:00 Kyiv wall time across the March transition', () => {
    // 2026-03-25 10:00 Kyiv (UTC+2) -> 2026-04-01 10:00 Kyiv (UTC+3)
    expect(addWeekKyiv('2026-03-25T08:00:00.000Z')).toBe('2026-04-01T07:00:00.000Z');
  });

  it('keeps 10:00 Kyiv wall time across the October transition', () => {
    // 2026-10-21 10:00 Kyiv (UTC+3) -> 2026-10-28 10:00 Kyiv (UTC+2)
    expect(addWeekKyiv('2026-10-21T07:00:00.000Z')).toBe('2026-10-28T08:00:00.000Z');
  });

  it('is a no-op for the wall clock in ordinary weeks', () => {
    const start = '2026-08-06T07:00:00.000Z'; // 10:00 Kyiv, no transition near
    const next = addWeekKyiv(start);
    expect(next).toBe('2026-08-13T07:00:00.000Z');
  });
});

describe('createBooking — weekly series', () => {
  it('creates repeatCount instances sharing a series_id, one week apart', () => {
    const before = countBookings();
    const first = createBooking(1, {
      ...VALID,
      title: 'Series',
      startAt: slot(13),
      endAt: slot(14),
      repeatCount: 3,
    }) as { id: number; series_id: string | null };
    expect(first.series_id).toBeTruthy();
    expect(countBookings()).toBe(before + 3);

    const rows = db
      .prepare('SELECT start_at, series_id FROM bookings WHERE series_id = ? ORDER BY start_at')
      .all(first.series_id) as { start_at: string; series_id: string }[];
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.series_id).toBe(first.series_id);

    // Same Kyiv wall time every week (robust across DST: compare wall clock,
    // not raw ms).
    const [w1, w2, w3] = rows.map((r) => toZonedTime(r.start_at, 'Europe/Kyiv'));
    for (const w of [w1, w2, w3]) {
      expect(w.getHours()).toBe(13);
      expect(w.getMinutes()).toBe(0);
    }
    expect(Math.round((w2.getTime() - w1.getTime()) / 86_400_000)).toBe(7);
    expect(Math.round((w3.getTime() - w2.getTime()) / 86_400_000)).toBe(7);
  });

  it('keeps a single booking (no repeatCount) free of series_id', () => {
    const booking = createBooking(1, { ...VALID, startAt: slot(14), endAt: slot(15) }) as {
      series_id: string | null;
    };
    expect(booking.series_id).toBeNull();
  });

  it('rolls back the whole series when a later instance conflicts', () => {
    const before = countBookings();
    // Block the slot one week after the base (same weekday, same time).
    createBooking(1, {
      ...VALID,
      title: 'Block',
      startAt: nextWeekSlot(15),
      endAt: nextWeekSlot(16),
    });
    const beforeBlock = countBookings();

    expect(() =>
      createBooking(1, {
        ...VALID,
        title: 'Doomed',
        startAt: slot(15),
        endAt: slot(16),
        repeatCount: 3,
      })
    ).toThrowError(BookingConflictErrorType);

    // All-or-nothing: the first instance was rolled back too.
    expect(countBookings()).toBe(beforeBlock);
    expect(countBookings()).toBe(before + 1);
  });
});

describe('repeatBooking — turn single into series, extend existing', () => {
  it('converts a single booking into a series', () => {
    const before = countBookings();
    const single = createBooking(1, { ...VALID, startAt: slot(9), endAt: slot(9, 30) }) as { id: number };
    const created = repeatBooking(1, single.id, 2);
    expect(created).toBe(2);
    expect(countBookings()).toBe(before + 3);

    const updated = db
      .prepare('SELECT series_id FROM bookings WHERE id = ?')
      .get(single.id) as { series_id: string | null };
    expect(updated.series_id).toBeTruthy();
    const members = db
      .prepare('SELECT COUNT(*) AS n FROM bookings WHERE series_id = ?')
      .get(updated.series_id) as { n: number };
    expect(members.n).toBe(3);
  });

  it('extends an existing series after its last occurrence', () => {
    const first = createBooking(1, {
      ...VALID,
      title: 'Extend',
      startAt: slot(16),
      endAt: slot(17),
      repeatCount: 2,
    }) as { id: number };
    const before = countBookings();
    repeatBooking(1, first.id, 1);
    expect(countBookings()).toBe(before + 1);
  });

  it('rejects repeating someone else\u2019s booking', () => {
    const other = createBooking(3, {
      roomId: 2,
      title: 'Other',
      startAt: slot(18, 30),
      endAt: slot(19),
    }) as { id: number };
    expect(() => repeatBooking(1, other.id, 1)).toThrowError(/own bookings/);
  });

  it('rolls back an extension when the next slot is taken', () => {
    const series = createBooking(1, {
      ...VALID,
      title: 'Rollback',
      startAt: slot(17),
      endAt: slot(18),
      repeatCount: 2,
    }) as { id: number; series_id: string };
    const lastStart = db
      .prepare('SELECT MAX(start_at) AS m FROM bookings WHERE series_id = ?')
      .get(series.series_id) as { m: string };
    const nextWeek = addWeekKyiv(lastStart.m);
    createBooking(1, {
      ...VALID,
      title: 'Blocker',
      startAt: nextWeek,
      endAt: new Date(new Date(nextWeek).getTime() + 3_600_000).toISOString(),
    });

    const before = countBookings();
    expect(() => repeatBooking(1, series.id, 1)).toThrowError(BookingConflictErrorType);
    expect(countBookings()).toBe(before);
  });
});

describe('cancelSeries', () => {
  it('removes every instance of the series', () => {
    const first = createBooking(1, {
      ...VALID,
      title: 'ToKill',
      startAt: slot(18),
      endAt: slot(19),
      repeatCount: 3,
    }) as { series_id: string };
    cancelSeries(1, first.series_id);
    const left = db
      .prepare('SELECT 1 FROM bookings WHERE series_id = ?')
      .all(first.series_id);
    expect(left).toHaveLength(0);
  });

  it('returns 404 for an unknown series or another user\u2019s series', () => {
    const mine = createBooking(1, {
      ...VALID,
      title: 'Mine',
      startAt: slot(12),
      endAt: slot(13),
      repeatCount: 2,
    }) as { series_id: string };
    const theirs = createBooking(3, {
      roomId: 2,
      title: 'Theirs',
      startAt: slot(18),
      endAt: slot(18, 30),
      repeatCount: 2,
    }) as { series_id: string };
    expect(() => cancelSeries(1, theirs.series_id)).toThrowError(BookingErrorType);
    expect(() => cancelSeries(2, mine.series_id)).toThrowError(BookingErrorType);
    // Both series untouched.
    expect(db.prepare('SELECT 1 FROM bookings WHERE series_id = ?').all(theirs.series_id)).toHaveLength(2);
    expect(db.prepare('SELECT 1 FROM bookings WHERE series_id = ?').all(mine.series_id)).toHaveLength(2);
  });
});

describe('createBooking — validation passthrough', () => {
  it('rejects an unverified user with 403', () => {
    expect(() => createBooking(2, VALID)).toThrowError(/verify your email/);
  });

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
