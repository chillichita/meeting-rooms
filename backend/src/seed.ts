import bcrypt from 'bcryptjs';
import { fromZonedTime } from 'date-fns-tz';
import { db } from './db.js';

const ROOMS = [
  { name: 'Mercury', floor: 2, capacity: 4 },
  { name: 'Mars', floor: 3, capacity: 8 },
  { name: 'Venus', floor: 1, capacity: 6 },
  { name: 'Earth', floor: 4, capacity: 10 },
  { name: 'Jupiter', floor: 2, capacity: 6 },
  { name: 'Saturn', floor: 1, capacity: 12 }
];

const USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'alice12345' },
  { name: 'Bob', email: 'bob@example.com', password: 'bob12345' },
];

// Build a Kyiv wall-clock slot as a UTC instant using the same tzdb as the
// working-hours validation (date-fns-tz), so seeds stay consistent with the
// office-hours checks regardless of DST rules in the local timezone data.
function kyivSlot(dayOffset: number, hour: number, minute = 0): string {
  const now = new Date();
  const wall = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour, minute);
  return fromZonedTime(wall, 'Europe/Kyiv').toISOString();
}

const insertRoom = db.prepare(
  'INSERT OR IGNORE INTO rooms (name, floor, capacity) VALUES (?, ?, ?)'
);
for (const r of ROOMS) insertRoom.run(r.name, r.floor, r.capacity);

const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 1)'
);
// Test users start verified so the README's demo flow (log in, book) works
// out of the box — the verify flow itself is exercised by newly registered
// users, in tests and manually.
for (const u of USERS) {
  insertUser.run(u.name, u.email.toLowerCase(), bcrypt.hashSync(u.password, 10));
}

// Demo bookings only when the table is empty — keeps the seed idempotent.
if (!db.prepare('SELECT 1 FROM bookings LIMIT 1').get()) {
  const insertDemo = db.prepare(`
    INSERT INTO bookings (user_id, room_id, title, start_at, end_at)
    SELECT u.id, r.id, ?, ?, ?
    FROM users u, rooms r
    WHERE u.email = ? AND r.name = ?
  `);

  const DEMO_BOOKINGS = [
    { email: 'alice@example.com', room: 'Mercury', title: 'Sprint planning', start: kyivSlot(1, 10), end: kyivSlot(1, 11) },
    { email: 'bob@example.com', room: 'Mars', title: '1:1 with PM', start: kyivSlot(1, 14), end: kyivSlot(1, 15, 30) },
    { email: 'alice@example.com', room: 'Venus', title: 'Design review', start: kyivSlot(2, 9), end: kyivSlot(2, 10) },
    { email: 'bob@example.com', room: 'Earth', title: 'Architecture sync', start: kyivSlot(2, 11), end: kyivSlot(2, 12) },
    { email: 'alice@example.com', room: 'Jupiter', title: 'Team retro', start: kyivSlot(3, 15), end: kyivSlot(3, 16) },
    { email: 'bob@example.com', room: 'Saturn', title: 'Product planning', start: kyivSlot(3, 10), end: kyivSlot(3, 11) },
  ];

  for (const b of DEMO_BOOKINGS) {
    insertDemo.run(b.title, b.start, b.end, b.email, b.room);
  }
}

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
console.log(
  `Seeded: ${count('SELECT COUNT(*) AS n FROM rooms')} rooms, ` +
    `${count('SELECT COUNT(*) AS n FROM users')} users, ` +
    `${count('SELECT COUNT(*) AS n FROM bookings')} bookings`
);
