import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { fromZonedTime } from 'date-fns-tz';

const dir = mkdtempSync(path.join(tmpdir(), 'mr-bookings-api-'));
process.env.DB_PATH = path.join(dir, 'test.db');

let app: Express;
let db: InstanceType<typeof Database>;

// Kyiv wall slots tomorrow (same tzdb as production), always in the future.
const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);
const slot = (h: number, m = 0) =>
  fromZonedTime(
    new Date(TOMORROW.getFullYear(), TOMORROW.getMonth(), TOMORROW.getDate(), h, m),
    'Europe/Kyiv',
  ).toISOString();

const BODY = (h: number, endH: number, title = 'Planning') => ({
  roomId: 1,
  title,
  startAt: slot(h),
  endAt: slot(endH),
});

beforeAll(async () => {
  const dbModule = await import('../db.js');
  db = dbModule.db;
  app = (await import('../app.js')).app;

  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Mercury', 2, 6)").run();
  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Saturn', 1, 12)").run();
  db.prepare(
    'INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 1)'
  ).run('Alice', 'alice@example.com', bcrypt.hashSync('alice12345', 10));
  db.prepare(
    'INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 1)'
  ).run('Bob', 'bob@example.com', bcrypt.hashSync('bob12345', 10));
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const login = (email: string, password: string) => {
  const agent = request.agent(app);
  return agent.post('/api/auth/login').send({ email, password }).then((r) => {
    expect(r.status).toBe(200);
    return agent;
  });
};

describe('POST /api/bookings', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/bookings').send(BODY(10, 11));
    expect(res.status).toBe(401);
  });

  it('creates a booking for an authenticated user', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const res = await agent.post('/api/bookings').send(BODY(10, 11));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Planning', user_id: 1, room_id: 1 });
    expect(res.body.start_at).toBe(slot(10));
  });

  it('rejects an overlapping slot with 409', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const res = await agent.post('/api/bookings').send(BODY(10, 11));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Slot already booked');
  });

  it('rejects a booking outside office hours with a clear message', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const res = await agent.post('/api/bookings').send(BODY(19, 20));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/after office hours/);
  });

  it('returns field-level validation errors', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const res = await agent.post('/api/bookings').send({ ...BODY(10, 11), title: '' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ field: 'title', message: 'Title is required' });
  });

  it('rejects an unknown room with 404', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const res = await agent.post('/api/bookings').send({ ...BODY(10, 11), roomId: 999 });
    expect(res.status).toBe(404);
  });

  it('race: two concurrent requests for one slot -> exactly one booking', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const payload = BODY(16, 17, 'Race slot');
    const [a, b] = await Promise.all([
      agent.post('/api/bookings').send(payload),
      agent.post('/api/bookings').send(payload),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM bookings WHERE room_id = 1 AND start_at = ?')
      .get(slot(16)) as { n: number };
    expect(count.n).toBe(1);
  });
});

describe('email verification gate', () => {
  it('blocks booking before verification, allows it after', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Dave',
      email: 'dave@example.com',
      password: 'dave12345',
    });
    expect(res.status).toBe(201);

    const agent = await login('dave@example.com', 'dave12345');
    const blocked = await agent.post('/api/bookings').send(BODY(9, 10));
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/verify your email/);

    // Dev-mode: the token lives in the DB (the "server log" equivalent).
    const row = db
      .prepare('SELECT token FROM verification_tokens vt JOIN users u ON u.id = vt.user_id WHERE u.email = ?')
      .get('dave@example.com') as { token: string } | undefined;
    expect(row).toBeDefined();

    const verify = await request(app).get(`/api/auth/verify?token=${row!.token}`);
    expect(verify.status).toBe(302);

    const allowed = await agent.post('/api/bookings').send(BODY(9, 10));
    expect(allowed.status).toBe(201);
  });
});

describe('GET /api/bookings/notifications', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/bookings/notifications');
    expect(res.status).toBe(401);
  });
});

describe('recurring series (API)', () => {
  // All series tests use room 2 (Saturn) so their weekly slots never collide
  // with the room-1 fixtures of the other describes.
  const S = (h: number, endH: number, title: string) => ({ ...BODY(h, endH, title), roomId: 2 });

  it('creates a weekly series from repeatCount', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const res = await agent
      .post('/api/bookings')
      .send({ ...S(13, 14, 'Weekly sync'), repeatCount: 3 });
    expect(res.status).toBe(201);
    expect(res.body.series_id).toBeTruthy();

    const mine = await agent.get('/api/bookings');
    const rows = mine.body.filter((b: { title: string }) => b.title === 'Weekly sync');
    expect(rows).toHaveLength(3);
    const ids = new Set(rows.map((b: { series_id: string | null }) => b.series_id));
    expect(ids.size).toBe(1);
    expect(ids.has(null)).toBe(false);
  });

  it('rejects a series whose later instance conflicts — nothing is created', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    // Block the same slot next week via SQL.
    const nextWeek = new Date(TOMORROW);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const start = fromZonedTime(
      new Date(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate(), 14),
      'Europe/Kyiv',
    ).toISOString();
    db.prepare(
      'INSERT INTO bookings (user_id, room_id, title, start_at, end_at) VALUES (1, 2, ?, ?, ?)'
    ).run('Series blocker', start, new Date(new Date(start).getTime() + 3_600_000).toISOString());

    const res = await agent
      .post('/api/bookings')
      .send({ ...S(14, 15, 'Doomed series'), repeatCount: 2 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Slot already booked/);

    const mine = await agent.get('/api/bookings');
    expect(mine.body.filter((b: { title: string }) => b.title === 'Doomed series')).toHaveLength(0);
  });

  it('rejects an out-of-range repeatCount', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const zero = await agent.post('/api/bookings').send({ ...S(8, 9, 'Zero'), repeatCount: 0 });
    expect(zero.status).toBe(400);
    const huge = await agent.post('/api/bookings').send({ ...S(8, 9, 'Huge'), repeatCount: 53 });
    expect(huge.status).toBe(400);
  });

  it('repeats a single booking into a series via POST /:id/repeat', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const created = await agent.post('/api/bookings').send(S(11, 12, 'Repeat me'));
    expect(created.status).toBe(201);

    const res = await agent.post(`/api/bookings/${created.body.id}/repeat`).send({ count: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: 2 });

    const mine = await agent.get('/api/bookings');
    const rows = mine.body.filter((b: { title: string }) => b.title === 'Repeat me');
    expect(rows).toHaveLength(3);
  });

  it('forbids repeating someone else\u2019s booking', async () => {
    const alice = await login('alice@example.com', 'alice12345');
    const bob = await login('bob@example.com', 'bob12345');
    const created = await bob.post('/api/bookings').send(S(16, 17, "Bob's series"));
    expect(created.status).toBe(201);

    const res = await alice.post(`/api/bookings/${created.body.id}/repeat`).send({ count: 2 });
    expect(res.status).toBe(403);
  });

  it('cancels a whole series via DELETE /series/:seriesId, owner-only', async () => {
    const alice = await login('alice@example.com', 'alice12345');
    const bob = await login('bob@example.com', 'bob12345');

    const mine = await alice.post('/api/bookings').send({ ...S(9, 10, 'Alice series'), repeatCount: 2 });
    const theirs = await bob.post('/api/bookings').send({ ...S(15, 16, 'Bob series'), repeatCount: 2 });
    expect(mine.status).toBe(201);
    expect(theirs.status).toBe(201);

    // Alice cannot touch Bob's series.
    const forbidden = await alice.delete(`/api/bookings/series/${theirs.body.series_id}`);
    expect(forbidden.status).toBe(404);

    const ok = await alice.delete(`/api/bookings/series/${mine.body.series_id}`);
    expect(ok.status).toBe(204);

    const list = await alice.get('/api/bookings');
    expect(list.body.filter((b: { title: string }) => b.title === 'Alice series')).toHaveLength(0);
  });

  it('cancels a single occurrence without touching the rest of the series', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const created = await agent.post('/api/bookings').send({ ...S(17, 18, 'Occurrence'), repeatCount: 3 });
    expect(created.status).toBe(201);

    const del = await agent.delete(`/api/bookings/${created.body.id}`);
    expect(del.status).toBe(204);

    const mine = await agent.get('/api/bookings');
    const left = mine.body.filter((b: { title: string }) => b.title === 'Occurrence');
    expect(left).toHaveLength(2);
    expect(new Set(left.map((b: { series_id: string }) => b.series_id)).size).toBe(1);
  });
});

describe('GET /api/bookings', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/bookings');
    expect(res.status).toBe(401);
  });

  it('lists own bookings with room info, soonest first', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    await agent.post('/api/bookings').send(BODY(15, 16, 'List me'));
    await agent.post('/api/bookings').send(BODY(17, 18, 'List me later'));

    const res = await agent.get('/api/bookings');
    expect(res.status).toBe(200);
    const mine = res.body.filter((b: { title: string }) => b.title.startsWith('List me'));
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ title: 'List me', room_id: 1, room_name: 'Mercury', floor: 2 });
    expect(new Date(mine[0].start_at).getTime()).toBeLessThan(new Date(mine[1].start_at).getTime());
  });

  it('does not leak other users\' bookings', async () => {
    const alice = await login('alice@example.com', 'alice12345');
    const bob = await login('bob@example.com', 'bob12345');
    await bob.post('/api/bookings').send(BODY(16, 17, 'Bob secret'));

    const res = await alice.get('/api/bookings');
    expect(res.status).toBe(200);
    expect(res.body.some((b: { title: string }) => b.title === 'Bob secret')).toBe(false);
  });
});

describe('DELETE /api/bookings/:id', () => {
  it('cancels an own booking', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const created = await agent.post('/api/bookings').send(BODY(12, 13, 'To cancel'));
    expect(created.status).toBe(201);

    const res = await agent.delete(`/api/bookings/${created.body.id}`);
    expect(res.status).toBe(204);

    const row = db.prepare('SELECT 1 FROM bookings WHERE id = ?').get(created.body.id);
    expect(row).toBeUndefined();
  });

  it('forbids cancelling someone else\'s booking', async () => {
    const alice = await login('alice@example.com', 'alice12345');
    const bob = await login('bob@example.com', 'bob12345');
    const created = await bob.post('/api/bookings').send(BODY(14, 15, "Bob's"));
    expect(created.status).toBe(201);

    const res = await alice.delete(`/api/bookings/${created.body.id}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own bookings/);

    const row = db.prepare('SELECT 1 FROM bookings WHERE id = ?').get(created.body.id);
    expect(row).toBeDefined();
  });

  it('returns 404 for an unknown booking', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const res = await agent.delete('/api/bookings/9999');
    expect(res.status).toBe(404);
  });

  it('rejects a non-numeric id with 400', async () => {
    const agent = await login('alice@example.com', 'alice12345');
    const res = await agent.delete('/api/bookings/abc');
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).delete('/api/bookings/1');
    expect(res.status).toBe(401);
  });
});
