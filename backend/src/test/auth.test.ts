import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';

const dir = mkdtempSync(path.join(tmpdir(), 'mr-auth-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');

let app: Express;
let db: InstanceType<typeof Database>;

const USER = { name: 'Carol', email: 'carol@example.com', password: 'secret1234' };

beforeAll(async () => {
  const dbModule = await import('../db.js');
  db = dbModule.db;
  app = (await import('../app.js')).app;
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/auth/register', () => {
  it('registers a user and normalizes the email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...USER, email: 'Carol@Example.com ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Carol', email: 'carol@example.com' });
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('rejects a duplicate email case-insensitively', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...USER, email: 'CAROL@example.com' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ field: 'email' });
  });

  it('rejects a short password with a field error', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...USER, email: 'x@example.com', password: '1234567' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ field: 'password' });
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...USER, email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ field: 'email' });
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with a case-insensitive email and sets an httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'CAROL@example.com', password: USER.password });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'carol@example.com' });
    expect(res.headers['set-cookie']?.[0] ?? '').toMatch(/token=.*HttpOnly/i);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: 'wrongpass1' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email with the same generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'whatever1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Incorrect email or password.');
  });
});

describe('session lifecycle', () => {
  it('requires authentication for /me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the user for an authenticated session and revokes it on logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: USER.email, password: USER.password }).expect(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ name: 'Carol', email: 'carol@example.com' });

    await agent.post('/api/auth/logout').expect(204);
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
  });
});
