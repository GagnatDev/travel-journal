import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { PushSubscription } from '../models/PushSubscription.model.js';
import { User } from '../models/User.model.js';
import { generateAccessToken, hashPassword } from '../services/auth.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ??
  'mongodb://localhost:27017/travel-journal-test-notification-router';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await PushSubscription.deleteMany({});
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

describe('POST /api/v1/notifications/subscriptions', () => {
  it('upserts a push subscription for the authenticated user', async () => {
    const user = await makeUser('user@test.com');
    const res = await request(app)
      .post('/api/v1/notifications/subscriptions')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole))
      .send({
        subscription: {
          endpoint: 'https://push.example/sub-1',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-key',
          },
        },
        deviceLabel: 'Chrome',
      });

    expect(res.status).toBe(201);

    const stored = await PushSubscription.findOne({ userId: user._id }).lean();
    expect(stored).not.toBeNull();
    expect(stored?.endpoint).toBe('https://push.example/sub-1');
    expect(stored?.deviceLabel).toBe('Chrome');
  });

  it('returns 400 for invalid payload', async () => {
    const user = await makeUser('user@test.com');
    const res = await request(app)
      .post('/api/v1/notifications/subscriptions')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole))
      .send({
        subscription: {
          endpoint: 'https://push.example/sub-1',
        },
      });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/notifications/subscriptions', () => {
  it('deletes the current user subscription by endpoint', async () => {
    const user = await makeUser('user@test.com');
    await PushSubscription.create({
      userId: user._id,
      endpoint: 'https://push.example/sub-1',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    });

    const res = await request(app)
      .delete('/api/v1/notifications/subscriptions')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole))
      .send({ endpoint: 'https://push.example/sub-1' });

    expect(res.status).toBe(204);

    const remaining = await PushSubscription.findOne({ userId: user._id }).lean();
    expect(remaining).toBeNull();
  });
});

describe('GET /api/v1/notifications/vapid-public-key', () => {
  it('returns 503 when push is not configured', async () => {
    const user = await makeUser('user@test.com');
    const previous = process.env['WEB_PUSH_VAPID_PUBLIC_KEY'];
    delete process.env['WEB_PUSH_VAPID_PUBLIC_KEY'];

    const res = await request(app)
      .get('/api/v1/notifications/vapid-public-key')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));

    expect(res.status).toBe(503);
    process.env['WEB_PUSH_VAPID_PUBLIC_KEY'] = previous;
  });

  it('returns VAPID key when configured', async () => {
    const user = await makeUser('user@test.com');
    process.env['WEB_PUSH_VAPID_PUBLIC_KEY'] = 'public-key';

    const res = await request(app)
      .get('/api/v1/notifications/vapid-public-key')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));

    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe('public-key');
  });
});
