import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { Entry } from '../models/Entry.model.js';
import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { hashPassword, generateAccessToken } from '../services/auth.service.js';

const { onePxPng } = vi.hoisted(() => ({
  onePxPng: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
}));

vi.mock('../services/media.service.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/media.service.js')>();
  return {
    ...mod,
    getObjectBuffer: vi.fn().mockResolvedValue(onePxPng),
  };
});

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-trip-router';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await Entry.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const app = createApp();

async function makeUser(
  email: string,
  appRole: 'admin' | 'creator' | 'follower' = 'creator',
) {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0],
    appRole,
  });
}

function authHeader(userId: string, email: string, appRole: 'admin' | 'creator' | 'follower') {
  const token = generateAccessToken({ userId, email, appRole });
  return `Bearer ${token}`;
}

describe('POST /api/v1/trips', () => {
  it('returns 403 for follower appRole', async () => {
    const user = await makeUser('follower@test.com', 'follower');
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(user._id), user.email, 'follower'))
      .send({ name: 'My Trip' });

    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    const user = await makeUser('creator@test.com', 'creator');
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(user._id), user.email, 'creator'))
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 201 with trip for creator; creator is in members', async () => {
    const user = await makeUser('creator@test.com', 'creator');
    const userId = String(user._id);
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(userId, user.email, 'creator'))
      .send({ name: 'My Trip' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Trip');
    expect(res.body.status).toBe('planned');
    const member = res.body.members.find((m: { userId: string }) => m.userId === userId);
    expect(member).toBeDefined();
    expect(member.tripRole).toBe('creator');
    expect(member.notificationPreferences.newEntriesMode).toBe('per_entry');
  });
});

describe('GET /api/v1/trips', () => {
  it('returns only trips the requesting user belongs to', async () => {
    const user1 = await makeUser('user1@test.com', 'creator');
    const user2 = await makeUser('user2@test.com', 'creator');

    // user1 creates a trip, user2 creates a trip
    await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(user1._id), user1.email, 'creator'))
      .send({ name: 'User1 Trip' });

    await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(user2._id), user2.email, 'creator'))
      .send({ name: 'User2 Trip' });

    const res = await request(app)
      .get('/api/v1/trips')
      .set('Authorization', authHeader(String(user1._id), user1.email, 'creator'));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('User1 Trip');
  });
});

describe('GET /api/v1/trips/:id/photobook.pdf', () => {
  it('returns 400 for planned trip', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'Planned Trip' });
    const tripId = createRes.body.id as string;

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/photobook.pdf`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(400);
  });

  it('returns PDF for active trip with entries', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'Active Trip' });
    const tripId = createRes.body.id as string;

    await Trip.updateOne({ _id: tripId }, { $set: { status: 'active' } });

    await Entry.create({
      tripId: new mongoose.Types.ObjectId(tripId),
      authorId: creator._id,
      title: 'Morning walk',
      content: 'We strolled along the pier.',
      images: [
        {
          key: `media/${tripId}/a.jpg`,
          width: 100,
          height: 100,
          order: 0,
          uploadedAt: new Date(),
        },
      ],
      reactions: [],
      deletedAt: null,
      createdAt: new Date('2026-06-01T10:00:00Z'),
    });

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/photobook.pdf`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(body.length).toBeGreaterThan(500);
    expect(String(res.headers['content-disposition'])).toContain('photobook.pdf');
  });
});

describe('GET /api/v1/trips/:id', () => {
  it('returns 404 for non-member (do not leak existence)', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const other = await makeUser('other@test.com', 'follower');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'Private Trip' });

    const tripId = createRes.body.id as string;

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', authHeader(String(other._id), other.email, 'follower'));

    expect(res.status).toBe(404);
  });

  it('returns 200 for a member', async () => {
    const creator = await makeUser('creator@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('My Trip');
  });
});

describe('PATCH /api/v1/trips/:id', () => {
  it('returns 403 for non-creator member', async () => {
    // We need a trip with two members; easiest is to directly add to DB
    const creator = await makeUser('creator@test.com', 'creator');
    const contributor = await makeUser('contrib@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    // Manually add contributor to the trip with role 'contributor'
    await Trip.updateOne(
      { _id: tripId },
      {
        $push: {
          members: { userId: contributor._id, tripRole: 'contributor', addedAt: new Date() },
        },
      },
    );

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', authHeader(String(contributor._id), contributor.email, 'creator'))
      .send({ name: 'Updated' });

    expect(res.status).toBe(403);
  });

  it('returns 200 for creator', async () => {
    const creator = await makeUser('creator@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });

  it('returns 200 and persists description for creator', async () => {
    const creator = await makeUser('creator@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ description: '  Weekend in Bergen  ' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Weekend in Bergen');
  });
});

describe('PATCH /api/v1/trips/:id/members/me/notification-preferences', () => {
  it('persists the chosen newEntriesMode and returns it on the trip', async () => {
    const creator = await makeUser('creator@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    for (const mode of ['off', 'daily_digest', 'per_entry'] as const) {
      const res = await request(app)
        .patch(`/api/v1/trips/${tripId}/members/me/notification-preferences`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({ newEntriesMode: mode });

      expect(res.status).toBe(200);
      const me = res.body.members.find(
        (m: { userId: string }) => m.userId === String(creator._id),
      );
      expect(me.notificationPreferences.newEntriesMode).toBe(mode);
    }
  });

  it('clears the legacy newEntriesPushEnabled field on write', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });
    const tripId = createRes.body.id as string;

    await Trip.updateOne(
      { _id: tripId, 'members.userId': creator._id },
      { $set: { 'members.$.notificationPreferences.newEntriesPushEnabled': false } },
    );

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/me/notification-preferences`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ newEntriesMode: 'daily_digest' });

    expect(res.status).toBe(200);

    const doc = await Trip.findById(tripId).lean();
    const member = doc!.members.find(
      (m) => String(m.userId) === String(creator._id),
    )!;
    expect(member.notificationPreferences.newEntriesMode).toBe('daily_digest');
    expect(member.notificationPreferences.newEntriesPushEnabled).toBeUndefined();
  });

  it('falls back to legacy newEntriesPushEnabled=false as off on read', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });
    const tripId = createRes.body.id as string;

    await Trip.updateOne(
      { _id: tripId, 'members.userId': creator._id },
      {
        $set: { 'members.$.notificationPreferences.newEntriesPushEnabled': false },
        $unset: { 'members.$.notificationPreferences.newEntriesMode': '' },
      },
    );

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    const me = res.body.members.find(
      (m: { userId: string }) => m.userId === String(creator._id),
    );
    expect(me.notificationPreferences.newEntriesMode).toBe('off');
  });

  it('returns 400 for invalid mode', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/me/notification-preferences`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ newEntriesMode: 'nope' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/trips/:id/status', () => {
  it('returns 400 for invalid status transition', async () => {
    const creator = await makeUser('creator@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    // planned → completed is invalid
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ status: 'completed' });

    expect(res.status).toBe(400);
  });

  it('returns 200 with updated status for valid transition', async () => {
    const creator = await makeUser('creator@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });
});

describe('DELETE /api/v1/trips/:id', () => {
  it('returns 409 for active trip', async () => {
    const creator = await makeUser('creator@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    await request(app)
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ status: 'active' });

    const res = await request(app)
      .delete(`/api/v1/trips/${tripId}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(409);
  });

  it('returns 204 for completed trip', async () => {
    const creator = await makeUser('creator@test.com', 'creator');

    const createRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ name: 'My Trip' });

    const tripId = createRes.body.id as string;

    await request(app)
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ status: 'active' });

    await request(app)
      .patch(`/api/v1/trips/${tripId}/status`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ status: 'completed' });

    const res = await request(app)
      .delete(`/api/v1/trips/${tripId}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(204);
  });
});
