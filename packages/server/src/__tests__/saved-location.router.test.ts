import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { Entry } from '../models/Entry.model.js';
import { SavedLocation } from '../models/SavedLocation.model.js';
import { Comment } from '../models/Comment.model.js';
import { hashPassword, generateAccessToken } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';
import { createEntry } from '../services/entry.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-saved-locations';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await Entry.deleteMany({});
  await SavedLocation.deleteMany({});
  await Comment.deleteMany({});
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

async function setupTripWithMember(creatorAppRole: 'admin' | 'creator' | 'follower' = 'creator') {
  const creator = await makeUser('creator@test.com', creatorAppRole);
  const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));
  return { creator, trip };
}

describe('Saved locations API', () => {
  describe('POST /api/v1/trips/:id/saved-locations', () => {
    it('creator → 201', async () => {
      const { creator, trip } = await setupTripWithMember();

      const res = await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({ lat: 59.9139, lng: 10.7522, name: 'Coffee' });

      expect(res.status).toBe(201);
      expect(res.body.lat).toBe(59.9139);
      expect(res.body.lng).toBe(10.7522);
      expect(res.body.name).toBe('Coffee');
      expect(res.body.id).toBeDefined();
      expect(res.body.savedByUserId).toBe(String(creator._id));

      const count = await SavedLocation.countDocuments({ tripId: trip.id });
      expect(count).toBe(1);
    });

    it('contributor → 201', async () => {
      const { trip } = await setupTripWithMember('creator');
      const contrib = await makeUser('contrib@test.com', 'creator');
      await Trip.updateOne(
        { _id: trip.id },
        {
          $push: {
            members: {
              userId: contrib._id,
              tripRole: 'contributor',
              addedAt: new Date(),
            },
          },
        },
      );

      const res = await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(contrib._id), contrib.email, 'creator'))
        .send({ lat: 1, lng: 2 });

      expect(res.status).toBe(201);
    });

    it('follower → 403', async () => {
      const { trip } = await setupTripWithMember();
      const follower = await makeUser('follow@test.com', 'follower');
      await Trip.updateOne(
        { _id: trip.id },
        {
          $push: {
            members: {
              userId: follower._id,
              tripRole: 'follower',
              addedAt: new Date(),
            },
          },
        },
      );

      const res = await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(follower._id), follower.email, 'follower'))
        .send({ lat: 1, lng: 2 });

      expect(res.status).toBe(403);
    });

    it('non-member → 404', async () => {
      const { trip } = await setupTripWithMember();
      const outsider = await makeUser('outside@test.com', 'creator');

      const res = await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(outsider._id), outsider.email, 'creator'))
        .send({ lat: 1, lng: 2 });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/trips/:id/saved-locations', () => {
    it('returns saved locations for trip', async () => {
      const { creator, trip } = await setupTripWithMember();
      await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({ lat: 55, lng: 12, name: 'A' });

      const res = await request(app)
        .get(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('A');
    });
  });

  describe('DELETE /api/v1/trips/:id/saved-locations/:savedId', () => {
    it('contributor deletes → 204', async () => {
      const { creator, trip } = await setupTripWithMember('creator');
      const contrib = await makeUser('contrib2@test.com', 'creator');
      await Trip.updateOne(
        { _id: trip.id },
        {
          $push: {
            members: {
              userId: contrib._id,
              tripRole: 'contributor',
              addedAt: new Date(),
            },
          },
        },
      );

      const postRes = await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({ lat: 1, lng: 2 });
      const savedId = postRes.body.id as string;

      const delRes = await request(app)
        .delete(`/api/v1/trips/${trip.id}/saved-locations/${savedId}`)
        .set('Authorization', authHeader(String(contrib._id), contrib.email, 'creator'));

      expect(delRes.status).toBe(204);
      expect(await SavedLocation.countDocuments({ tripId: trip.id })).toBe(0);
    });

    it('follower → 403', async () => {
      const { creator, trip } = await setupTripWithMember('creator');
      const follower = await makeUser('follower2@test.com', 'follower');
      await Trip.updateOne(
        { _id: trip.id },
        {
          $push: {
            members: {
              userId: follower._id,
              tripRole: 'follower',
              addedAt: new Date(),
            },
          },
        },
      );

      const postRes = await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({ lat: 3, lng: 4 });
      const savedId = postRes.body.id as string;

      const res = await request(app)
        .delete(`/api/v1/trips/${trip.id}/saved-locations/${savedId}`)
        .set('Authorization', authHeader(String(follower._id), follower.email, 'follower'));

      expect(res.status).toBe(403);
    });

    it('unknown id → 404', async () => {
      const { creator, trip } = await setupTripWithMember();
      const res = await request(app)
        .delete(`/api/v1/trips/${trip.id}/saved-locations/${new mongoose.Types.ObjectId().toHexString()}`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/trips/:id/map-pins', () => {
    it('merges entries with locations and saved bookmarks', async () => {
      const { creator, trip } = await setupTripWithMember();
      await createEntry(trip.id, String(creator._id), {
        title: 'Entry Pin',
        content: 'c',
        location: { lat: 10, lng: 20, name: 'E' },
      });
      await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({ lat: 60, lng: 5, name: 'Saved' });

      const res = await request(app)
        .get(`/api/v1/trips/${trip.id}/map-pins`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      const kinds = [...res.body.map((p: { kind: string }) => p.kind)].sort();
      expect(kinds).toContain('entry');
      expect(kinds).toContain('savedLocation');

      const entryPin = res.body.find((p: { kind: string }) => p.kind === 'entry');
      const savedPin = res.body.find((p: { kind: string }) => p.kind === 'savedLocation');

      expect(entryPin.title).toBe('Entry Pin');
      expect(savedPin.savedByDisplayName.length).toBeGreaterThanOrEqual(0);
      expect(savedPin.id).toBeDefined();
    });
  });

  describe('POST /api/v1/trips/:id/entries consuming saved location', () => {
    it('creates entry and deletes bookmark atomically', async () => {
      const { creator, trip } = await setupTripWithMember();

      const postRes = await request(app)
        .post(`/api/v1/trips/${trip.id}/saved-locations`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({ lat: 71, lng: 8, name: 'North' });

      expect(postRes.status).toBe(201);
      const savedId = postRes.body.id as string;

      const entryRes = await request(app)
        .post(`/api/v1/trips/${trip.id}/entries`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({
          title: 'Full story',
          content: 'We went hiking.',
          location: { lat: 71, lng: 8, name: 'North' },
          consumedSavedLocationId: savedId,
        });

      expect(entryRes.status).toBe(201);
      expect(entryRes.body.title).toBe('Full story');

      expect(await SavedLocation.countDocuments({ _id: savedId })).toBe(0);
    });

    it('wrong bookmark id → 400 and no orphan entry without bookmark deletion', async () => {
      const { creator, trip } = await setupTripWithMember();

      const badId = new mongoose.Types.ObjectId().toHexString();
      const beforeCount = await Entry.countDocuments({
        tripId: new mongoose.Types.ObjectId(trip.id),
      });

      const res = await request(app)
        .post(`/api/v1/trips/${trip.id}/entries`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({
          title: 'X',
          content: 'y',
          consumedSavedLocationId: badId,
        });

      expect(res.status).toBe(400);

      const afterCount = await Entry.countDocuments({
        tripId: new mongoose.Types.ObjectId(trip.id),
      });
      expect(afterCount).toBe(beforeCount);
    });

    it('bookmark from another trip → 400', async () => {
      const { creator, trip } = await setupTripWithMember();

      const otherOwner = await makeUser('owner2@test.com', 'creator');
      const trip2 = await createTrip({ name: 'Other' }, String(otherOwner._id));

      const postRes = await request(app)
        .post(`/api/v1/trips/${trip2.id}/saved-locations`)
        .set('Authorization', authHeader(String(otherOwner._id), otherOwner.email, 'creator'))
        .send({ lat: 40, lng: -74 });

      expect(postRes.status).toBe(201);
      const foreignSavedId = postRes.body.id as string;

      const res = await request(app)
        .post(`/api/v1/trips/${trip.id}/entries`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({
          title: 'X',
          content: 'y',
          consumedSavedLocationId: foreignSavedId,
        });

      expect(res.status).toBe(400);
      expect(await SavedLocation.countDocuments({ _id: foreignSavedId })).toBe(1);
    });

    it('invalid consumedSavedLocationId shape → 400', async () => {
      const { creator, trip } = await setupTripWithMember();

      const res = await request(app)
        .post(`/api/v1/trips/${trip.id}/entries`)
        .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
        .send({
          title: 'X',
          content: 'y',
          consumedSavedLocationId: 'not-an-object-id',
        });

      expect(res.status).toBe(400);
    });
  });
});
