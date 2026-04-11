import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { hashPassword, generateAccessToken } from '../services/auth.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-trip-router';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
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
