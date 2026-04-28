import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { Invite } from '../models/Invite.model.js';
import { Trip } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';
import { generateAccessToken, hashPassword } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-member-router';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await Invite.deleteMany({});
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

async function makeTrip(creatorId: string) {
  return createTrip({ name: 'Test Trip' }, creatorId);
}

async function addMemberToTrip(tripId: string, userId: string, role: 'contributor' | 'follower') {
  await Trip.updateOne(
    { _id: tripId },
    { $push: { members: { userId, tripRole: role, addedAt: new Date() } } },
  );
}

describe('GET /api/v1/trips/:id/members/invites/suggestions', () => {
  it('returns 403 for a non-creator member', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'creator');
    const trip = await makeTrip(String(creator._id));
    await addMemberToTrip(trip.id, String(contrib._id), 'contributor');

    const res = await request(app)
      .get(`/api/v1/trips/${trip.id}/members/invites/suggestions`)
      .set('Authorization', authHeader(String(contrib._id), contrib.email, 'creator'));

    expect(res.status).toBe(403);
  });

  it('returns contributors and followers from another trip the creator owns', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const alice = await makeUser('alice@test.com', 'follower');
    const bob = await makeUser('bob@test.com', 'follower');
    const tripA = await makeTrip(String(creator._id));
    const tripB = await makeTrip(String(creator._id));
    await addMemberToTrip(tripB.id, String(alice._id), 'contributor');
    await addMemberToTrip(tripB.id, String(bob._id), 'follower');

    const res = await request(app)
      .get(`/api/v1/trips/${tripA.id}/members/invites/suggestions`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    const emails = (res.body as { email: string }[]).map((r) => r.email).sort();
    expect(emails).toEqual(['alice@test.com', 'bob@test.com']);
  });

  it('excludes users already on the current trip', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const alice = await makeUser('alice@test.com', 'follower');
    const tripA = await makeTrip(String(creator._id));
    const tripB = await makeTrip(String(creator._id));
    await addMemberToTrip(tripB.id, String(alice._id), 'contributor');
    await addMemberToTrip(tripA.id, String(alice._id), 'follower');

    const res = await request(app)
      .get(`/api/v1/trips/${tripA.id}/members/invites/suggestions`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('as follower suggests trip creator and contributors from that trip', async () => {
    const owner = await makeUser('owner@test.com', 'creator');
    const follower = await makeUser('follower@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'follower');
    const tripFollowed = await makeTrip(String(owner._id));
    await addMemberToTrip(tripFollowed.id, String(contrib._id), 'contributor');
    await addMemberToTrip(tripFollowed.id, String(follower._id), 'follower');

    const tripOwn = await makeTrip(String(follower._id));

    const res = await request(app)
      .get(`/api/v1/trips/${tripOwn.id}/members/invites/suggestions`)
      .set('Authorization', authHeader(String(follower._id), follower.email, 'creator'));

    expect(res.status).toBe(200);
    const emails = (res.body as { email: string }[]).map((r) => r.email).sort();
    expect(emails).toEqual(['contrib@test.com', 'owner@test.com']);
  });
});

describe('POST /api/v1/trips/:id/members', () => {
  it('returns 403 for a contributor when allowContributorInvites is false', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'creator');
    const trip = await makeTrip(String(creator._id));

    await addMemberToTrip(trip.id, String(contrib._id), 'contributor');

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/members`)
      .set('Authorization', authHeader(String(contrib._id), contrib.email, 'creator'))
      .send({ emailOrNickname: 'new@test.com', tripRole: 'follower' });

    expect(res.status).toBe(403);
  });

  it('returns 200 for a contributor when allowContributorInvites is true', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'creator');
    const invitee = await makeUser('invitee@test.com', 'follower');
    const trip = await makeTrip(String(creator._id));

    await Trip.updateOne({ _id: trip.id }, { $set: { allowContributorInvites: true } });
    await addMemberToTrip(trip.id, String(contrib._id), 'contributor');

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/members`)
      .set('Authorization', authHeader(String(contrib._id), contrib.email, 'creator'))
      .send({ emailOrNickname: invitee.email, tripRole: 'follower' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('added');
  });

  it('returns 200 { type: "added" } when adding an existing user by email', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    await makeUser('existing@test.com', 'follower');
    const trip = await makeTrip(String(creator._id));

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/members`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ emailOrNickname: 'existing@test.com', tripRole: 'follower' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('added');
  });

  it('returns 200 { type: "invite_created", inviteLink } for an unknown email', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const trip = await makeTrip(String(creator._id));

    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/members`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ emailOrNickname: 'unknown@test.com', tripRole: 'contributor' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('invite_created');
    expect(res.body.inviteLink).toContain('/invite/accept?token=');
  });
});

describe('PATCH /api/v1/trips/:id/members/:userId/role', () => {
  it('returns 403 for non-creator', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'creator');
    const trip = await makeTrip(String(creator._id));
    await addMemberToTrip(trip.id, String(contrib._id), 'contributor');

    const res = await request(app)
      .patch(`/api/v1/trips/${trip.id}/members/${String(creator._id)}/role`)
      .set('Authorization', authHeader(String(contrib._id), contrib.email, 'creator'))
      .send({ tripRole: 'follower' });

    expect(res.status).toBe(403);
  });

  it('changes role from contributor to follower successfully', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'follower');
    const trip = await makeTrip(String(creator._id));
    await addMemberToTrip(trip.id, String(contrib._id), 'contributor');

    const res = await request(app)
      .patch(`/api/v1/trips/${trip.id}/members/${String(contrib._id)}/role`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ tripRole: 'follower' });

    expect(res.status).toBe(200);

    const tripDoc = await Trip.findById(trip.id);
    const member = tripDoc!.members.find((m) => String(m.userId) === String(contrib._id));
    expect(member!.tripRole).toBe('follower');
  });

  it('returns 400 when attempting to change the trip creator\'s role', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const trip = await makeTrip(String(creator._id));

    const res = await request(app)
      .patch(`/api/v1/trips/${trip.id}/members/${String(creator._id)}/role`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .send({ tripRole: 'follower' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/trips/:id/members/:userId', () => {
  it('returns 403 for non-creator', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'creator');
    const trip = await makeTrip(String(creator._id));
    await addMemberToTrip(trip.id, String(contrib._id), 'contributor');

    const res = await request(app)
      .delete(`/api/v1/trips/${trip.id}/members/${String(contrib._id)}`)
      .set('Authorization', authHeader(String(contrib._id), contrib.email, 'creator'));

    expect(res.status).toBe(403);
  });

  it('removes a member and returns 204', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'follower');
    const trip = await makeTrip(String(creator._id));
    await addMemberToTrip(trip.id, String(contrib._id), 'contributor');

    const res = await request(app)
      .delete(`/api/v1/trips/${trip.id}/members/${String(contrib._id)}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(204);

    const tripDoc = await Trip.findById(trip.id);
    expect(tripDoc!.members.find((m) => String(m.userId) === String(contrib._id))).toBeUndefined();
  });

  it('returns 400 when attempting to remove the trip creator', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const trip = await makeTrip(String(creator._id));

    const res = await request(app)
      .delete(`/api/v1/trips/${trip.id}/members/${String(creator._id)}`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(400);
  });
});
