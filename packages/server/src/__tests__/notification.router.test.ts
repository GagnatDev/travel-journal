import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { Notification } from '../models/Notification.model.js';
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
  await Notification.deleteMany({});
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

describe('GET /api/v1/notifications', () => {
  it('returns the current user notifications newest-first with unread count', async () => {
    const user = await makeUser('user@test.com');
    const other = await makeUser('other@test.com');

    const older = await Notification.create({
      userId: user._id,
      type: 'trip.new_entry',
      data: {
        type: 'trip.new_entry',
        tripId: 'trip-1',
        tripName: 'Trip',
        entryId: 'e-1',
        entryTitle: 'Older',
        authorId: 'a',
        authorName: 'A',
      },
    });
    // Make the second one strictly newer.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await Notification.create({
      userId: user._id,
      type: 'trip.new_entry',
      data: {
        type: 'trip.new_entry',
        tripId: 'trip-1',
        tripName: 'Trip',
        entryId: 'e-2',
        entryTitle: 'Newer',
        authorId: 'a',
        authorName: 'A',
      },
    });
    await Notification.create({
      userId: other._id,
      type: 'trip.new_entry',
      data: {
        type: 'trip.new_entry',
        tripId: 'trip-1',
        tripName: 'Trip',
        entryId: 'e-3',
        entryTitle: 'Other user',
        authorId: 'a',
        authorName: 'A',
      },
    });

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(2);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.notifications[0].id).toBe(String(newer._id));
    expect(res.body.notifications[1].id).toBe(String(older._id));
    expect(res.body.notifications[0].readAt).toBeNull();
  });

  it('excludes dismissed notifications', async () => {
    const user = await makeUser('user@test.com');
    await Notification.create({
      userId: user._id,
      type: 'trip.new_entry',
      dismissedAt: new Date(),
      readAt: new Date(),
      data: {
        type: 'trip.new_entry',
        tripId: 'trip-1',
        tripName: 'Trip',
        entryId: 'e-1',
        entryTitle: 'T',
        authorId: 'a',
        authorName: 'A',
      },
    });

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(0);
    expect(res.body.unreadCount).toBe(0);
  });
});

describe('POST /api/v1/notifications/read-all', () => {
  it('marks all unread notifications for the user read', async () => {
    const user = await makeUser('user@test.com');
    await Notification.create([
      {
        userId: user._id,
        type: 'trip.new_entry',
        data: {
          type: 'trip.new_entry',
          tripId: 't',
          tripName: 'T',
          entryId: 'e1',
          entryTitle: 'E',
          authorId: 'a',
          authorName: 'A',
        },
      },
      {
        userId: user._id,
        type: 'trip.new_entry',
        data: {
          type: 'trip.new_entry',
          tripId: 't',
          tripName: 'T',
          entryId: 'e2',
          entryTitle: 'E',
          authorId: 'a',
          authorName: 'A',
        },
      },
    ]);

    const res = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));

    expect(res.status).toBe(204);
    const stored = await Notification.find({ userId: user._id });
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      expect(row.readAt).toBeInstanceOf(Date);
    }
  });
});

describe('DELETE /api/v1/notifications/:id', () => {
  it('soft-deletes the current user row', async () => {
    const user = await makeUser('user@test.com');
    const row = await Notification.create({
      userId: user._id,
      type: 'trip.new_entry',
      data: {
        type: 'trip.new_entry',
        tripId: 't',
        tripName: 'T',
        entryId: 'e',
        entryTitle: 'E',
        authorId: 'a',
        authorName: 'A',
      },
    });

    const res = await request(app)
      .delete(`/api/v1/notifications/${String(row._id)}`)
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));

    expect(res.status).toBe(204);
    const reloaded = await Notification.findById(row._id);
    expect(reloaded?.dismissedAt).toBeInstanceOf(Date);
  });

  it('refuses to dismiss a row owned by another user', async () => {
    const user = await makeUser('user@test.com');
    const other = await makeUser('other@test.com');
    const row = await Notification.create({
      userId: other._id,
      type: 'trip.new_entry',
      data: {
        type: 'trip.new_entry',
        tripId: 't',
        tripName: 'T',
        entryId: 'e',
        entryTitle: 'E',
        authorId: 'a',
        authorName: 'A',
      },
    });

    const res = await request(app)
      .delete(`/api/v1/notifications/${String(row._id)}`)
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));

    expect(res.status).toBe(404);
    const reloaded = await Notification.findById(row._id);
    expect(reloaded?.dismissedAt).toBeNull();
  });

  it('returns 400 for invalid id', async () => {
    const user = await makeUser('user@test.com');
    const res = await request(app)
      .delete('/api/v1/notifications/not-an-id')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/notifications (clear all)', () => {
  it('soft-deletes every active row for the current user', async () => {
    const user = await makeUser('user@test.com');
    const other = await makeUser('other@test.com');
    await Notification.create([
      {
        userId: user._id,
        type: 'trip.new_entry',
        data: {
          type: 'trip.new_entry',
          tripId: 't',
          tripName: 'T',
          entryId: 'e1',
          entryTitle: 'E',
          authorId: 'a',
          authorName: 'A',
        },
      },
      {
        userId: user._id,
        type: 'trip.new_entry',
        data: {
          type: 'trip.new_entry',
          tripId: 't',
          tripName: 'T',
          entryId: 'e2',
          entryTitle: 'E',
          authorId: 'a',
          authorName: 'A',
        },
      },
      {
        userId: other._id,
        type: 'trip.new_entry',
        data: {
          type: 'trip.new_entry',
          tripId: 't',
          tripName: 'T',
          entryId: 'e3',
          entryTitle: 'E',
          authorId: 'a',
          authorName: 'A',
        },
      },
    ]);

    const res = await request(app)
      .delete('/api/v1/notifications')
      .set('Authorization', authHeader(String(user._id), user.email, user.appRole));

    expect(res.status).toBe(204);
    const mine = await Notification.find({ userId: user._id });
    for (const row of mine) {
      expect(row.dismissedAt).toBeInstanceOf(Date);
    }
    const theirs = await Notification.findOne({ userId: other._id });
    expect(theirs?.dismissedAt).toBeNull();
  });
});
