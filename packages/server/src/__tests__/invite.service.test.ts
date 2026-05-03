import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { Invite } from '../models/Invite.model.js';
import { Notification } from '../models/Notification.model.js';
import { Trip } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';
import { hashPassword, hashToken } from '../services/auth.service.js';
import {
  acceptInvite,
  addTripMember,
  createPlatformInvite,
  createTripInvite,
  validateInviteToken,
} from '../services/invite.service.js';
import { createTrip } from '../services/trip.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-invite-service';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await Invite.deleteMany({});
  await Notification.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function makeUser(email: string, appRole: 'admin' | 'creator' | 'follower' = 'creator') {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0]!,
    appRole,
  });
}

describe('createPlatformInvite', () => {
  it('stores only tokenHash (not the raw token), and the raw token hashes to the stored value', async () => {
    const admin = await makeUser('admin@test.com', 'admin');

    const { invite, rawToken } = await createPlatformInvite(
      'new@test.com',
      'creator',
      String(admin._id),
    );

    const doc = await Invite.findById(invite.id);
    expect(doc).toBeTruthy();
    expect(doc!.tokenHash).not.toBe(rawToken);
    expect(doc!.tokenHash).toBe(hashToken(rawToken));
  });

  it('creates platform invite with correct fields', async () => {
    const admin = await makeUser('admin@test.com', 'admin');

    const { invite } = await createPlatformInvite('user@test.com', 'follower', String(admin._id));

    expect(invite.type).toBe('platform');
    expect(invite.email).toBe('user@test.com');
    expect(invite.assignedAppRole).toBe('follower');
    expect(invite.status).toBe('pending');
  });
});

describe('validateInviteToken', () => {
  it('throws 410 for expired invites', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken, invite } = await createPlatformInvite(
      'user@test.com',
      'creator',
      String(admin._id),
    );

    // Manually expire it
    await Invite.updateOne({ _id: invite.id }, { expiresAt: new Date(Date.now() - 1000) });

    await expect(validateInviteToken(rawToken)).rejects.toMatchObject({
      status: 410,
      code: 'INVITE_GONE',
    });
  });

  it('throws 410 for already-accepted invites', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken, invite } = await createPlatformInvite(
      'user@test.com',
      'creator',
      String(admin._id),
    );

    await Invite.updateOne({ _id: invite.id }, { status: 'accepted' });

    await expect(validateInviteToken(rawToken)).rejects.toMatchObject({
      status: 410,
      code: 'INVITE_GONE',
    });
  });

  it('returns invite for a valid pending token', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken } = await createPlatformInvite('user@test.com', 'creator', String(admin._id));

    const invite = await validateInviteToken(rawToken);
    expect(invite.email).toBe('user@test.com');
    expect(invite.status).toBe('pending');
  });
});

describe('acceptInvite', () => {
  it('creates User with correct appRole and marks invite accepted', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken } = await createPlatformInvite(
      'newuser@test.com',
      'creator',
      String(admin._id),
    );

    const { user } = await acceptInvite(rawToken, 'New User', 'password123');

    expect(user.appRole).toBe('creator');
    expect(user.email).toBe('newuser@test.com');
    expect(user.displayName).toBe('New User');

    const doc = await Invite.findOne({ email: 'newuser@test.com' });
    expect(doc!.status).toBe('accepted');
  });

  it('for a trip invite, adds user to trip.members with correct tripRole', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const trip = await createTrip({ name: 'My Trip' }, String(creator._id));

    const { rawToken } = await createTripInvite(
      trip.id,
      'newmember@test.com',
      'contributor',
      String(creator._id),
    );

    const { userId } = await acceptInvite(rawToken, 'New Member', 'password123');

    const tripDoc = await Trip.findById(trip.id);
    expect(tripDoc!.members.some((m) => m.tripRole === 'contributor')).toBe(true);
    const newMember = tripDoc!.members.find((m) => m.tripRole === 'contributor');
    expect(newMember).toBeTruthy();

    const notif = await Notification.findOne({ userId, type: 'trip.member_added' }).lean();
    expect(notif).toBeTruthy();
    expect(notif!.data).toMatchObject({
      type: 'trip.member_added',
      tripId: trip.id,
      tripName: 'My Trip',
      tripRole: 'contributor',
      addedByUserId: String(creator._id),
    });
  });

  it('returns a valid access token', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken } = await createPlatformInvite(
      'tokenuser@test.com',
      'creator',
      String(admin._id),
    );

    const { accessToken } = await acceptInvite(rawToken, 'Token User', 'password123');

    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(10);
  });

  it('throws 409 when email is already registered', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    await makeUser('existing@test.com', 'follower');
    const { rawToken } = await createPlatformInvite(
      'existing@test.com',
      'creator',
      String(admin._id),
    );

    await expect(acceptInvite(rawToken, 'Existing', 'password123')).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_CONFLICT',
    });
  });
});

describe('addTripMember', () => {
  it('adds an existing user by email directly', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const other = await makeUser('other@test.com', 'follower');
    const trip = await createTrip({ name: 'Trip' }, String(creator._id));

    const result = await addTripMember(trip.id, 'other@test.com', 'follower', String(creator._id));

    expect(result.type).toBe('added');

    const tripDoc = await Trip.findById(trip.id);
    const newMember = tripDoc!.members.find((m) => String(m.userId) === String(other._id));
    expect(newMember).toBeTruthy();
    expect(newMember!.tripRole).toBe('follower');

    const notif = await Notification.findOne({
      userId: other._id,
      type: 'trip.member_added',
    }).lean();
    expect(notif).toBeTruthy();
    expect(notif!.data).toMatchObject({
      type: 'trip.member_added',
      tripId: trip.id,
      tripName: 'Trip',
      tripRole: 'follower',
      addedByUserId: String(creator._id),
    });
  });

  it('adds an existing user by displayName (case-insensitive)', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    await makeUser('other@test.com', 'follower');
    const trip = await createTrip({ name: 'Trip' }, String(creator._id));

    // displayName is derived from email prefix: 'other'
    const result = await addTripMember(trip.id, 'OTHER', 'follower', String(creator._id));

    expect(result.type).toBe('added');
  });

  it('generates an invite for an unknown email and returns invite_created', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const trip = await createTrip({ name: 'Trip' }, String(creator._id));

    const result = await addTripMember(
      trip.id,
      'unknown@test.com',
      'contributor',
      String(creator._id),
    );

    expect(result.type).toBe('invite_created');
    if (result.type === 'invite_created') {
      expect(typeof result.rawToken).toBe('string');
      expect(result.rawToken.length).toBeGreaterThan(0);
    }

    const invite = await Invite.findOne({ email: 'unknown@test.com' });
    expect(invite).toBeTruthy();
    expect(invite!.type).toBe('trip');
    expect(invite!.tripRole).toBe('contributor');
  });

  it('rejects contributor when allowContributorInvites is false', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'follower');
    const trip = await createTrip({ name: 'Trip' }, String(creator._id));
    await Trip.updateOne(
      { _id: trip.id },
      { $push: { members: { userId: contrib._id, tripRole: 'contributor', addedAt: new Date() } } },
    );

    await expect(
      addTripMember(trip.id, 'other@test.com', 'follower', String(contrib._id)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows contributor when allowContributorInvites is true', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const contrib = await makeUser('contrib@test.com', 'follower');
    const other = await makeUser('other@test.com', 'follower');
    const trip = await createTrip({ name: 'Trip' }, String(creator._id));
    await Trip.updateOne(
      { _id: trip.id },
      {
        $set: { allowContributorInvites: true },
        $push: { members: { userId: contrib._id, tripRole: 'contributor', addedAt: new Date() } },
      },
    );

    const result = await addTripMember(trip.id, other.email, 'follower', String(contrib._id));
    expect(result.type).toBe('added');
  });
});
