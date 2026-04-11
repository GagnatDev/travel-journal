import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { Entry } from '../models/Entry.model.js';
import { hashPassword, generateAccessToken } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';
import { createEntry } from '../services/entry.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-entry-router';

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
    displayName: email.split('@')[0]!,
    appRole,
  });
}

function authHeader(userId: string, email: string, appRole: 'admin' | 'creator' | 'follower') {
  const token = generateAccessToken({ userId, email, appRole });
  return `Bearer ${token}`;
}

async function setupTripWithMember(
  creatorAppRole: 'admin' | 'creator' | 'follower' = 'creator',
) {
  const creator = await makeUser('creator@test.com', creatorAppRole);
  const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));
  return { creator, trip };
}

describe('POST /api/v1/trips/:id/entries', () => {
  it('follower → 403', async () => {
    const { trip } = await setupTripWithMember('creator');

    // Add a follower to the trip
    await User.create({
      email: 'follower@test.com',
      passwordHash: await hashPassword('password'),
      displayName: 'follower',
      appRole: 'follower',
    });
    const followerUser = await makeUser('follower2@test.com', 'follower');

    // Manually add follower to trip
    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: {
            userId: followerUser._id,
            tripRole: 'follower',
            addedAt: new Date(),
          },
        },
      },
    );

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/entries`)
      .set('Authorization', authHeader(String(followerUser._id), followerUser.email, 'follower'))
      .send({ title: 'Hello', content: 'World' });

    expect(res.status).toBe(403);
  });

  it('contributor → 201', async () => {
    const { trip } = await setupTripWithMember('creator');
    const contributor = await makeUser('contributor@test.com', 'creator');

    // Add contributor to trip
    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: {
            userId: contributor._id,
            tripRole: 'contributor',
            addedAt: new Date(),
          },
        },
      },
    );

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/entries`)
      .set(
        'Authorization',
        authHeader(String(contributor._id), contributor.email, 'creator'),
      )
      .send({ title: 'My Entry', content: 'Some content' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('My Entry');
  });

  it('creator → 201', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/entries`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ title: 'Creator Entry', content: 'Content' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Creator Entry');
  });

  it('returns 400 when title is missing', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/entries`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ content: 'No title' });

    expect(res.status).toBe(400);
  });

  it('non-member → 404', async () => {
    const { trip } = await setupTripWithMember('creator');
    const stranger = await makeUser('stranger@test.com', 'creator');

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/entries`)
      .set('Authorization', authHeader(String(stranger._id), stranger.email, 'creator'))
      .send({ title: 'Sneaky', content: 'content' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/trips/:id/entries', () => {
  it('returns paginated list; soft-deleted entries absent', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    const e1 = await createEntry(trip.id, String(creator._id), {
      title: 'Entry 1',
      content: 'a',
    });
    const e2 = await createEntry(trip.id, String(creator._id), {
      title: 'Entry 2',
      content: 'b',
    });

    // Soft-delete e2
    await Entry.updateOne({ _id: e2.id }, { deletedAt: new Date() });

    const res = await request(app)
      .get(`/api/v1/trips/${trip.id}/entries`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].id).toBe(e1.id);
    expect(res.body.total).toBe(1);
  });

  it('respects page and limit query params', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    for (let i = 0; i < 5; i++) {
      await createEntry(trip.id, String(creator._id), { title: `E${i}`, content: 'x' });
    }

    const res = await request(app)
      .get(`/api/v1/trips/${trip.id}/entries?page=1&limit=3`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.total).toBe(5);
  });

  it('non-member → 404', async () => {
    const { trip } = await setupTripWithMember('creator');
    const stranger = await makeUser('stranger@test.com', 'creator');

    const res = await request(app)
      .get(`/api/v1/trips/${trip.id}/entries`)
      .set('Authorization', authHeader(String(stranger._id), stranger.email, 'creator'));

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/trips/:id/entries/:entryId', () => {
  it('returns the entry for a member', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'Detail',
      content: 'content',
    });

    const res = await request(app)
      .get(`/api/v1/trips/${trip.id}/entries/${entry.id}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Detail');
  });

  it('soft-deleted entry → 404', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'Gone',
      content: 'content',
    });
    await Entry.updateOne({ _id: entry.id }, { deletedAt: new Date() });

    const res = await request(app)
      .get(`/api/v1/trips/${trip.id}/entries/${entry.id}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/trips/:id/entries/:entryId', () => {
  it('non-author → 403', async () => {
    const { creator, trip } = await setupTripWithMember('creator');
    const other = await makeUser('other@test.com', 'creator');

    // Add other as contributor
    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: {
            userId: other._id,
            tripRole: 'contributor',
            addedAt: new Date(),
          },
        },
      },
    );

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'Original',
      content: 'content',
    });

    const res = await request(app)
      .patch(`/api/v1/trips/${trip.id}/entries/${entry.id}`)
      .set('Authorization', authHeader(String(other._id), other.email, 'creator'))
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
  });

  it('author → 200 with updated entry', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'Original',
      content: 'old content',
    });

    const res = await request(app)
      .patch(`/api/v1/trips/${trip.id}/entries/${entry.id}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ title: 'Updated', content: 'new content' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.content).toBe('new content');
  });
});

describe('DELETE /api/v1/trips/:id/entries/:entryId', () => {
  it('author → 204; document has deletedAt set, not removed', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'To Delete',
      content: 'content',
    });

    const res = await request(app)
      .delete(`/api/v1/trips/${trip.id}/entries/${entry.id}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(204);

    // Document still exists with deletedAt set
    const doc = await Entry.findById(entry.id);
    expect(doc).not.toBeNull();
    expect(doc?.deletedAt).not.toBeNull();
  });

  it('subsequent GET returns 404 for the deleted entry', async () => {
    const { creator, trip } = await setupTripWithMember('creator');

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'To Delete',
      content: 'content',
    });

    await request(app)
      .delete(`/api/v1/trips/${trip.id}/entries/${entry.id}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    const getRes = await request(app)
      .get(`/api/v1/trips/${trip.id}/entries/${entry.id}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(getRes.status).toBe(404);
  });

  it('non-author → 403', async () => {
    const { creator, trip } = await setupTripWithMember('creator');
    const other = await makeUser('other@test.com', 'creator');

    // Add other as contributor
    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: {
            userId: other._id,
            tripRole: 'contributor',
            addedAt: new Date(),
          },
        },
      },
    );

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'Mine',
      content: 'content',
    });

    const res = await request(app)
      .delete(`/api/v1/trips/${trip.id}/entries/${entry.id}`)
      .set('Authorization', authHeader(String(other._id), other.email, 'creator'));

    expect(res.status).toBe(403);
  });
});
