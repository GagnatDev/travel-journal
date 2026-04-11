import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { User } from '../models/User.model.js';
import { generateAccessToken, hashPassword } from '../services/auth.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-user-router';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const app = createApp();

async function makeUser(email: string, appRole: 'admin' | 'creator' | 'follower' = 'creator') {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0]!,
    appRole,
  });
}

function authHeader(userId: string, email: string, appRole: 'admin' | 'creator' | 'follower') {
  const token = generateAccessToken({ userId, email, appRole });
  return `Bearer ${token}`;
}

describe('GET /api/v1/users', () => {
  it('returns 403 for non-admin', async () => {
    const user = await makeUser('user@test.com', 'creator');

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', authHeader(String(user._id), user.email, 'creator'));

    expect(res.status).toBe(403);
  });

  it('returns all users for admin', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    await makeUser('user1@test.com', 'creator');
    await makeUser('user2@test.com', 'follower');

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', authHeader(String(admin._id), admin.email, 'admin'));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });
});

describe('PATCH /api/v1/users/:id/promote', () => {
  it('promotes a follower to creator', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const follower = await makeUser('follower@test.com', 'follower');

    const res = await request(app)
      .patch(`/api/v1/users/${String(follower._id)}/promote`)
      .set('Authorization', authHeader(String(admin._id), admin.email, 'admin'));

    expect(res.status).toBe(200);
    expect(res.body.appRole).toBe('creator');

    const updated = await User.findById(follower._id);
    expect(updated!.appRole).toBe('creator');
  });

  it('returns 400 when promoting a user who is already creator', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const creator = await makeUser('creator@test.com', 'creator');

    const res = await request(app)
      .patch(`/api/v1/users/${String(creator._id)}/promote`)
      .set('Authorization', authHeader(String(admin._id), admin.email, 'admin'));

    expect(res.status).toBe(400);
  });

  it('returns 400 when promoting a user who is already admin', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const admin2 = await makeUser('admin2@test.com', 'admin');

    const res = await request(app)
      .patch(`/api/v1/users/${String(admin2._id)}/promote`)
      .set('Authorization', authHeader(String(admin._id), admin.email, 'admin'));

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('updates preferredLocale and returns 200', async () => {
    const user = await makeUser('user@test.com', 'creator');

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', authHeader(String(user._id), user.email, 'creator'))
      .send({ preferredLocale: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.preferredLocale).toBe('en');

    const updated = await User.findById(user._id);
    expect(updated!.preferredLocale).toBe('en');
  });

  it('requires auth', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .send({ preferredLocale: 'en' });

    expect(res.status).toBe(401);
  });
});
