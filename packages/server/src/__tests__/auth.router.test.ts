import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { AdminPasswordResetToken } from '../models/AdminPasswordResetToken.model.js';
import { User } from '../models/User.model.js';
import { Session } from '../models/Session.model.js';
import { generateAccessToken, hashPassword } from '../services/auth.service.js';

const MONGO_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-auth';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['ADMIN_EMAIL'] = 'admin@test.com';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Session.deleteMany({});
  await AdminPasswordResetToken.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const app = createApp();

describe('POST /api/v1/auth/register', () => {
  it('rejects registration when an admin already exists', async () => {
    await User.create({
      email: 'admin@test.com',
      passwordHash: await hashPassword('pass'),
      displayName: 'Admin',
      appRole: 'admin',
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'admin@test.com',
      displayName: 'Admin',
      password: 'password123',
    });

    expect(res.status).toBe(403);
  });

  it('rejects a non-ADMIN_EMAIL with the same generic 403', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'hacker@evil.com',
      displayName: 'Hacker',
      password: 'password123',
    });

    expect(res.status).toBe(403);
  });

  it('succeeds for ADMIN_EMAIL when no admin exists', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'admin@test.com',
      displayName: 'Admin User',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.appRole).toBe('admin');
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await User.create({
      email: 'user@test.com',
      passwordHash: await hashPassword('correctpassword'),
      displayName: 'Test User',
      appRole: 'creator',
    });
  });

  it('returns 401 for unknown email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'unknown@test.com',
      password: 'password',
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'user@test.com',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with access token and sets cookie for correct credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'user@test.com',
      password: 'correctpassword',
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('user@test.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns 401 when no cookie is present', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns new access token and rotates cookie with valid refresh token', async () => {
    // First login to get a valid cookie
    await User.create({
      email: 'user@test.com',
      passwordHash: await hashPassword('password123'),
      displayName: 'Test User',
      appRole: 'creator',
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'user@test.com',
      password: 'password123',
    });

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie!);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 204 without credentials (idempotent)', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(204);
  });

  it('clears the session and cookie using refresh cookie', async () => {
    const user = await User.create({
      email: 'user@test.com',
      passwordHash: await hashPassword('password123'),
      displayName: 'Test User',
      appRole: 'creator',
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'user@test.com',
      password: 'password123',
    });

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];

    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', cookies);

    expect(res.status).toBe(204);

    const sessionCount = await Session.countDocuments({ userId: user._id });
    expect(sessionCount).toBe(0);
  });
});

function adminBearer(adminId: string, email: string) {
  return `Bearer ${generateAccessToken({ userId: adminId, email, appRole: 'admin' })}`;
}

describe('admin password reset via /api/v1/auth/password-reset', () => {
  it('GET validate returns 410 for unknown token', async () => {
    const res = await request(app).get('/api/v1/auth/password-reset/not-a-real-token/validate');
    expect(res.status).toBe(410);
  });

  it('POST complete returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/password-reset/complete')
      .send({ token: 'abc', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('completes reset and allows login with the new password', async () => {
    const admin = await User.create({
      email: 'admin@test.com',
      passwordHash: await hashPassword('adminpass'),
      displayName: 'Admin',
      appRole: 'admin',
    });
    const target = await User.create({
      email: 'target@test.com',
      passwordHash: await hashPassword('oldpass'),
      displayName: 'Target',
      appRole: 'creator',
    });

    const mint = await request(app)
      .post(`/api/v1/users/${String(target._id)}/password-reset-link`)
      .set('Authorization', adminBearer(String(admin._id), admin.email));

    expect(mint.status).toBe(201);
    const resetLink = mint.body.resetLink as string;
    const token = new URL(resetLink, 'http://localhost').searchParams.get('token')!;

    const val = await request(app).get(`/api/v1/auth/password-reset/${encodeURIComponent(token)}/validate`);
    expect(val.status).toBe(200);
    expect(val.body.email).toBe('target@test.com');

    const done = await request(app)
      .post('/api/v1/auth/password-reset/complete')
      .send({ token, password: 'newpass123' });
    expect(done.status).toBe(204);

    const reuse = await request(app)
      .post('/api/v1/auth/password-reset/complete')
      .send({ token, password: 'anotherpass12' });
    expect(reuse.status).toBe(410);

    const badOld = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target@test.com', password: 'oldpass' });
    expect(badOld.status).toBe(401);

    const ok = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target@test.com', password: 'newpass123' });
    expect(ok.status).toBe(200);
  });
});
