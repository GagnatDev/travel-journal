import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeAll } from 'vitest';

import { requireAuth, requireAppRole } from '../middleware/auth.middleware.js';
import { generateAccessToken } from '../services/auth.service.js';

beforeAll(() => {
  process.env['JWT_SECRET'] = 'test-secret';
});

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.get('/protected', requireAuth, (_req, res) => {
    res.json(res.locals['auth']);
  });

  app.get('/admin-only', requireAppRole('admin'), (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe('requireAuth middleware', () => {
  const app = createTestApp();

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });

  it('attaches decoded payload for a valid token', async () => {
    const payload = { userId: 'u1', email: 'a@b.com', appRole: 'creator' as const };
    const token = generateAccessToken(payload);

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('u1');
    expect(res.body.email).toBe('a@b.com');
    expect(res.body.appRole).toBe('creator');
  });
});

describe('requireAppRole middleware', () => {
  const app = createTestApp();

  it('passes for admin', async () => {
    const token = generateAccessToken({ userId: 'u1', email: 'a@b.com', appRole: 'admin' });
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 403 for creator', async () => {
    const token = generateAccessToken({ userId: 'u1', email: 'a@b.com', appRole: 'creator' });
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for follower', async () => {
    const token = generateAccessToken({ userId: 'u1', email: 'a@b.com', appRole: 'follower' });
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
