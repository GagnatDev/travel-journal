import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import webpush from 'web-push';

import { Entry } from '../models/Entry.model.js';
import { Notification } from '../models/Notification.model.js';
import { PushSubscription } from '../models/PushSubscription.model.js';
import { Trip } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';
import { hashPassword } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';
import { runDailyEntryDigest } from '../services/digest.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ??
  'mongodb://localhost:27017/travel-journal-test-digest-service';

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  const keys = webpush.generateVAPIDKeys();
  process.env['WEB_PUSH_VAPID_PUBLIC_KEY'] = keys.publicKey;
  process.env['WEB_PUSH_VAPID_PRIVATE_KEY'] = keys.privateKey;
  process.env['WEB_PUSH_SUBJECT'] = 'mailto:test@example.com';
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await Entry.deleteMany({});
  await PushSubscription.deleteMany({});
  await Notification.deleteMany({});
  vi.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function makeUser(email: string) {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0]!,
    appRole: 'follower',
  });
}

async function addMember(
  tripId: string,
  userId: mongoose.Types.ObjectId,
  mode: 'off' | 'per_entry' | 'daily_digest',
) {
  await Trip.updateOne(
    { _id: tripId },
    {
      $push: {
        members: {
          userId,
          tripRole: 'follower',
          addedAt: new Date(),
          notificationPreferences: { newEntriesMode: mode },
        },
      },
    },
  );
}

async function seedEntry(tripId: string, authorId: mongoose.Types.ObjectId, createdAt: Date) {
  return Entry.create({
    tripId: new mongoose.Types.ObjectId(tripId),
    authorId,
    title: 'Entry',
    content: 'body',
    images: [],
    reactions: [],
    createdAt,
  });
}

describe('runDailyEntryDigest', () => {
  it('enqueues one digest notification + one push per digest member with new entries', async () => {
    const creator = await makeUser('creator@test.com');
    const digestFollower = await makeUser('digest@test.com');
    const offFollower = await makeUser('off@test.com');
    const perEntryFollower = await makeUser('perentry@test.com');

    const trip = await createTrip({ name: 'Nordic Adventure' }, String(creator._id));
    await addMember(trip.id, digestFollower._id, 'daily_digest');
    await addMember(trip.id, offFollower._id, 'off');
    await addMember(trip.id, perEntryFollower._id, 'per_entry');

    const now = new Date('2026-04-18T20:00:00Z');
    await seedEntry(trip.id, creator._id, new Date(now.getTime() - 2 * 60 * 60 * 1000));
    await seedEntry(trip.id, creator._id, new Date(now.getTime() - 10 * 60 * 60 * 1000));

    await PushSubscription.create({
      userId: digestFollower._id,
      endpoint: 'https://push.example/digest-follower',
      keys: { p256dh: 'a', auth: 'a' },
    });

    const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);

    const result = await runDailyEntryDigest({ now });

    expect(result.recipients).toBe(1);
    expect(result.trips).toBe(1);

    const rows = await Notification.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.userId)).toBe(String(digestFollower._id));
    expect(rows[0]!.type).toBe('trip.new_entry_digest');
    expect(rows[0]!.data).toMatchObject({
      type: 'trip.new_entry_digest',
      tripId: trip.id,
      tripName: 'Nordic Adventure',
      entryCount: 2,
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [, payloadArg] = sendSpy.mock.calls[0]!;
    const payload = JSON.parse(String(payloadArg));
    expect(payload.type).toBe('trip.new_entry_digest');
    expect(payload.url).toBe(`/trips/${trip.id}/timeline`);
    expect(payload.body).toBe('2 new entries today');
  });

  it('excludes entries authored by the digest recipient', async () => {
    const creator = await makeUser('creator@test.com');
    const author = await makeUser('author@test.com');
    const trip = await createTrip({ name: 'Solo In Crowd' }, String(creator._id));
    await addMember(trip.id, author._id, 'daily_digest');

    const now = new Date('2026-04-18T20:00:00Z');
    await seedEntry(trip.id, author._id, new Date(now.getTime() - 3 * 60 * 60 * 1000));
    await seedEntry(trip.id, author._id, new Date(now.getTime() - 6 * 60 * 60 * 1000));

    const result = await runDailyEntryDigest({ now });

    expect(result.recipients).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('skips members whose digest window contains no new entries', async () => {
    const creator = await makeUser('creator@test.com');
    const digestFollower = await makeUser('digest@test.com');
    const trip = await createTrip({ name: 'Quiet Trip' }, String(creator._id));
    await addMember(trip.id, digestFollower._id, 'daily_digest');

    const now = new Date('2026-04-18T20:00:00Z');
    // Entry is older than the digest window.
    await seedEntry(trip.id, creator._id, new Date(now.getTime() - 36 * 60 * 60 * 1000));

    const result = await runDailyEntryDigest({ now });
    expect(result.recipients).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('is a no-op when there are no daily_digest members', async () => {
    const creator = await makeUser('creator@test.com');
    const follower = await makeUser('f@test.com');
    const trip = await createTrip({ name: 'Immediate Only' }, String(creator._id));
    await addMember(trip.id, follower._id, 'per_entry');

    const now = new Date('2026-04-18T20:00:00Z');
    await seedEntry(trip.id, creator._id, new Date(now.getTime() - 3 * 60 * 60 * 1000));

    const result = await runDailyEntryDigest({ now });
    expect(result.trips).toBe(0);
    expect(result.recipients).toBe(0);
  });
});
