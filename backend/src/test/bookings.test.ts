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

// Kyiv wall slots (same tzdb as production), inside week 2026-08-03..08-09.
const slot = (h: number, m = 0) =>
  fromZonedTime(new Date(2026, 7, 6, h, m), 'Europe/Kyiv').toISOString();

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
  db.prepare(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
  ).run('Alice', 'alice@example.com', bcrypt.hashSync('alice12345', 10));
  db.prepare(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
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

  it('requires authentication', async () => {
    const res = await request(app).delete('/api/bookings/1');
    expect(res.status).toBe(401);
  });
});
