import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { fromZonedTime } from 'date-fns-tz';

const dir = mkdtempSync(path.join(tmpdir(), 'mr-app-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');

let app: Express;
let db: InstanceType<typeof Database>;

// Kyiv wall slots (same tzdb as production), inside week 2026-08-03..08-09.
const slot = (h: number, m = 0) =>
  fromZonedTime(new Date(2026, 7, 6, h, m), 'Europe/Kyiv').toISOString();

beforeAll(async () => {
  const dbModule = await import('./db.js');
  db = dbModule.db;
  app = (await import('./app.js')).app;

  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Mercury', 2, 6)").run();
  db.prepare("INSERT INTO rooms (name, floor, capacity) VALUES ('Saturn', 1, 12)").run();
  db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('Alice', 'alice@example.com', 'x')").run();
  db.prepare(
    'INSERT INTO bookings (user_id, room_id, title, start_at, end_at) VALUES (1, 1, ?, ?, ?)'
  ).run('Sprint planning', slot(10), slot(11));
  db.prepare(
    'INSERT INTO bookings (user_id, room_id, title, start_at, end_at) VALUES (1, 1, ?, ?, ?)'
  ).run('Next week', fromZonedTime(new Date(2026, 7, 13, 10), 'Europe/Kyiv').toISOString(),
    fromZonedTime(new Date(2026, 7, 13, 11), 'Europe/Kyiv').toISOString());
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/rooms', () => {
  it('lists all rooms', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ name: 'Mercury', floor: 2, capacity: 6 });
    expect(res.body[0]).not.toHaveProperty('id', undefined);
  });

  it('filters by minimum capacity', async () => {
    const res = await request(app).get('/api/rooms').query({ capacity: 10 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Saturn');
  });

  it('rejects a non-integer capacity', async () => {
    const res = await request(app).get('/api/rooms').query({ capacity: 'abc' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rooms/:id/bookings', () => {
  it('returns the bookings of the week, with author names', async () => {
    const res = await request(app).get('/api/rooms/1/bookings').query({ week: '2026-08-06' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      title: 'Sprint planning',
      user_id: 1,
      user_name: 'Alice',
    });
    expect(res.body[0].start_at).toBe(slot(10));
  });

  it('excludes bookings from other weeks', async () => {
    const res = await request(app).get('/api/rooms/1/bookings').query({ week: '2026-08-10' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Next week');
  });

  it('returns an empty list for a week without bookings', async () => {
    const res = await request(app).get('/api/rooms/2/bookings').query({ week: '2026-08-06' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('rejects an unknown room with 404', async () => {
    const res = await request(app).get('/api/rooms/999/bookings').query({ week: '2026-08-06' });
    expect(res.status).toBe(404);
  });

  it('requires a week parameter', async () => {
    const res = await request(app).get('/api/rooms/1/bookings');
    expect(res.status).toBe(400);
  });

  it('rejects a malformed week date', async () => {
    const res = await request(app).get('/api/rooms/1/bookings').query({ week: '2026-02-30' });
    expect(res.status).toBe(400);
  });
});
