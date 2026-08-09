import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';

const dir = mkdtempSync(path.join(tmpdir(), 'mr-notify-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');

let db: InstanceType<typeof Database>;
let dueNotifications: (userId: number, nowIso: string) => unknown[];

// Fixed instants — the service compares ISO strings, no tz involved.
const T = (h: number, m = 0) => `2026-08-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

beforeAll(async () => {
  const dbModule = await import('../../db.js');
  db = dbModule.db;
  dueNotifications = (await import('../../services/notificationService.js')).dueNotifications;

  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Mercury', 2, 6)").run();
  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Venus', 1, 6)").run();
  db.prepare(
    "INSERT INTO users (name, email, password_hash, email_verified) VALUES ('Alice', 'a@example.com', 'x', 1)"
  ).run();
  db.prepare(
    "INSERT INTO users (name, email, password_hash, email_verified) VALUES ('Bob', 'b@example.com', 'x', 1)"
  ).run();

  const ins = db.prepare(
    'INSERT INTO bookings (user_id, room_id, title, start_at, end_at) VALUES (?, ?, ?, ?, ?)'
  );
  // Pair with an adjacent next slot (ends 12:00 -> next starts 12:00).
  ins.run(1, 1, 'A', T(11), T(12));
  ins.run(1, 1, 'B', T(12), T(13));
  // Lone booking in a different room, no one after it.
  ins.run(1, 2, 'C', T(14), T(15));
  // Bob's pair — must not leak to Alice.
  ins.run(2, 1, 'D', T(15), T(16));
  ins.run(2, 1, 'E', T(16), T(17));
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('dueNotifications', () => {
  it('notifies inside the window when the next slot is taken', () => {
    // A ends 12:00; NOTIFY_BEFORE=10 -> window 11:50..12:00. 11:55 is inside.
    const due = dueNotifications(1, T(11, 55)) as { booking_id: number; room_name: string; ends_in_minutes: number }[];
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ booking_id: 1, room_name: 'Mercury', ends_in_minutes: 5 });
  });

  it('delivers exactly once', () => {
    expect(dueNotifications(1, T(11, 56))).toHaveLength(0);
  });

  it('is silent without an adjacent booking', () => {
    expect(dueNotifications(1, T(14, 55))).toHaveLength(0);
  });

  it('is silent before the window opens', () => {
    expect(dueNotifications(1, T(11, 45))).toHaveLength(0);
  });

  it('is silent after the booking ended', () => {
    expect(dueNotifications(1, T(12, 5))).toHaveLength(0);
  });

  it('only surfaces the current user\u2019s bookings', () => {
    // D (15-16) is Bob's; Alice must get nothing from it.
    expect(dueNotifications(1, T(15, 55))).toHaveLength(0);
    const bob = dueNotifications(2, T(15, 55)) as { booking_id: number }[];
    expect(bob).toHaveLength(1);
    expect(bob[0].booking_id).toBe(4);
  });

  it('suppresses the notification when the next booking is cancelled', () => {
    db.prepare("INSERT INTO bookings (user_id, room_id, title, start_at, end_at) VALUES (1, 1, 'F', ?, ?)")
      .run(T(9), T(10));
    db.prepare("INSERT INTO bookings (user_id, room_id, title, start_at, end_at) VALUES (1, 1, 'G', ?, ?)")
      .run(T(10), T(11));

    expect(dueNotifications(1, T(9, 55))).toHaveLength(1); // F is due

    db.prepare('DELETE FROM bookings WHERE title = ?').run('G'); // next slot freed
    expect(dueNotifications(1, T(9, 56))).toHaveLength(0);
  });

  it('drops the sent marker when the booking itself is cancelled', () => {
    db.prepare('DELETE FROM bookings WHERE title = ?').run('F');
    const rows = db.prepare('SELECT 1 FROM notifications WHERE booking_id = 6').all();
    expect(rows).toHaveLength(0);
  });
});
