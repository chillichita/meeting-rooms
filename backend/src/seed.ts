import bcrypt from 'bcryptjs';
import { db } from './db.js';

const ROOMS = [
  { name: 'Aquarium', floor: 2, capacity: 6 },
  { name: 'Mars', floor: 3, capacity: 8 },
  { name: 'Gagarin', floor: 1, capacity: 4 },
  { name: 'Orbit', floor: 4, capacity: 10 },
  { name: 'Horizon', floor: 2, capacity: 6 },
];

const USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'alice12345' },
  { name: 'Bob', email: 'bob@example.com', password: 'bob12345' },
];

// Kyiv is UTC+2 year-round (no DST since 2025), so Kyiv hour H == UTC hour H-2.
// ponytail: offset baked into seeds only; real tz handling lands in MR-9 (date-fns-tz).
function kyivSlot(dayOffset: number, hour: number, minute = 0): string {
  const today = new Date();
  const day = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + dayOffset)
  );
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - 2, minute)).toISOString();
}

const insertRoom = db.prepare(
  'INSERT OR IGNORE INTO rooms (name, floor, capacity) VALUES (?, ?, ?)'
);
for (const r of ROOMS) insertRoom.run(r.name, r.floor, r.capacity);

const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (name, email, password_hash) VALUES (?, ?, ?)'
);
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
    { email: 'alice@example.com', room: 'Aquarium', title: 'Sprint planning', start: kyivSlot(1, 10), end: kyivSlot(1, 11) },
    { email: 'bob@example.com', room: 'Mars', title: '1:1 with PM', start: kyivSlot(1, 14), end: kyivSlot(1, 15, 30) },
    { email: 'alice@example.com', room: 'Gagarin', title: 'Design review', start: kyivSlot(2, 9), end: kyivSlot(2, 10) },
    { email: 'bob@example.com', room: 'Orbit', title: 'Architecture sync', start: kyivSlot(2, 11), end: kyivSlot(2, 12) },
    { email: 'alice@example.com', room: 'Aquarium', title: 'Team retro', start: kyivSlot(3, 15), end: kyivSlot(3, 16) },
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
