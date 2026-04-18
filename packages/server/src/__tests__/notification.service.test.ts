import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import webpush from 'web-push';

import { Notification } from '../models/Notification.model.js';
import { PushSubscription } from '../models/PushSubscription.model.js';
import { Trip } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';
import { hashPassword } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';
import { dispatchNewEntryNotification } from '../services/notification.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ??
  'mongodb://localhost:27017/travel-journal-test-notification-service';

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
  await PushSubscription.deleteMany({});
  await Notification.deleteMany({});
  vi.restoreAllMocks();
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

describe('dispatchNewEntryNotification', () => {
  it('enqueues inbox notifications only for recipients on per_entry mode', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const perEntryFollower = await makeUser('a@test.com', 'follower');
    const offFollower = await makeUser('b@test.com', 'follower');
    const digestFollower = await makeUser('c@test.com', 'follower');
    const trip = await createTrip({ name: 'Nordic Adventure' }, String(creator._id));

    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: [
            {
              userId: perEntryFollower._id,
              tripRole: 'follower',
              addedAt: new Date(),
              notificationPreferences: { newEntriesMode: 'per_entry' },
            },
            {
              userId: offFollower._id,
              tripRole: 'follower',
              addedAt: new Date(),
              notificationPreferences: { newEntriesMode: 'off' },
            },
            {
              userId: digestFollower._id,
              tripRole: 'follower',
              addedAt: new Date(),
              notificationPreferences: { newEntriesMode: 'daily_digest' },
            },
          ],
        },
      },
    );

    vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);

    await dispatchNewEntryNotification({
      id: 'entry-1',
      tripId: trip.id,
      authorId: String(creator._id),
      authorName: creator.displayName,
      title: 'New Story',
      content: 'Hello world',
      images: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const stored = await Notification.find({}).lean();
    expect(stored).toHaveLength(1);
    const [row] = stored;
    expect(String(row!.userId)).toBe(String(perEntryFollower._id));
    expect(row!.type).toBe('trip.new_entry');
    expect(row!.readAt).toBeNull();
    expect(row!.dismissedAt).toBeNull();
    expect(row!.data).toMatchObject({
      type: 'trip.new_entry',
      tripId: trip.id,
      entryId: 'entry-1',
      entryTitle: 'New Story',
      authorName: creator.displayName,
      tripName: 'Nordic Adventure',
    });
  });

  it('delivers web push only to per_entry subscribers', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const perEntryFollower = await makeUser('a@test.com', 'follower');
    const offFollower = await makeUser('b@test.com', 'follower');
    const digestFollower = await makeUser('c@test.com', 'follower');
    const trip = await createTrip({ name: 'Nordic Adventure' }, String(creator._id));

    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: [
            {
              userId: perEntryFollower._id,
              tripRole: 'follower',
              addedAt: new Date(),
              notificationPreferences: { newEntriesMode: 'per_entry' },
            },
            {
              userId: offFollower._id,
              tripRole: 'follower',
              addedAt: new Date(),
              notificationPreferences: { newEntriesMode: 'off' },
            },
            {
              userId: digestFollower._id,
              tripRole: 'follower',
              addedAt: new Date(),
              notificationPreferences: { newEntriesMode: 'daily_digest' },
            },
          ],
        },
      },
    );

    await PushSubscription.create([
      {
        userId: perEntryFollower._id,
        endpoint: 'https://push.example/member-a',
        keys: { p256dh: 'a', auth: 'a' },
      },
      {
        userId: offFollower._id,
        endpoint: 'https://push.example/member-b',
        keys: { p256dh: 'b', auth: 'b' },
      },
      {
        userId: digestFollower._id,
        endpoint: 'https://push.example/member-c',
        keys: { p256dh: 'c', auth: 'c' },
      },
      {
        userId: creator._id,
        endpoint: 'https://push.example/creator',
        keys: { p256dh: 'd', auth: 'd' },
      },
    ]);

    const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);

    await dispatchNewEntryNotification({
      id: 'entry-1',
      tripId: trip.id,
      authorId: String(creator._id),
      authorName: creator.displayName,
      title: 'New Story',
      content: 'Hello world',
      images: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [subscriptionArg, payloadArg] = sendSpy.mock.calls[0]!;
    expect(subscriptionArg.endpoint).toBe('https://push.example/member-a');
    const payload = JSON.parse(String(payloadArg));
    expect(payload.type).toBe('trip.new_entry');
    expect(payload.url).toBe(`/trips/${trip.id}/timeline?entryId=entry-1`);
    expect(payload.data.tripName).toBe('Nordic Adventure');
    expect(typeof payload.notificationId).toBe('string');
    expect(payload.notificationId.length).toBeGreaterThan(0);
  });

  it('is a no-op when the only trip member is the author', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const trip = await createTrip({ name: 'Solo Trip' }, String(creator._id));
    const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);

    await dispatchNewEntryNotification({
      id: 'entry-solo',
      tripId: trip.id,
      authorId: String(creator._id),
      authorName: creator.displayName,
      title: 'Alone',
      content: '',
      images: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(sendSpy).not.toHaveBeenCalled();
    const rows = await Notification.countDocuments({});
    expect(rows).toBe(0);
  });

  it('treats legacy newEntriesPushEnabled=false members as off', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const legacyOff = await makeUser('legacy-off@test.com', 'follower');
    const trip = await createTrip({ name: 'Legacy Trip' }, String(creator._id));

    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: {
            userId: legacyOff._id,
            tripRole: 'follower',
            addedAt: new Date(),
            notificationPreferences: { newEntriesPushEnabled: false },
          },
        },
      },
    );

    const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);

    await dispatchNewEntryNotification({
      id: 'entry-legacy',
      tripId: trip.id,
      authorId: String(creator._id),
      authorName: creator.displayName,
      title: 'Legacy',
      content: '',
      images: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('disables stale subscriptions on 410/404 responses', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const follower = await makeUser('a@test.com', 'follower');
    const trip = await createTrip({ name: 'Nordic Adventure' }, String(creator._id));

    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: {
            userId: follower._id,
            tripRole: 'follower',
            addedAt: new Date(),
            notificationPreferences: { newEntriesMode: 'per_entry' },
          },
        },
      },
    );

    await PushSubscription.create({
      userId: follower._id,
      endpoint: 'https://push.example/member-a',
      keys: { p256dh: 'a', auth: 'a' },
    });

    vi.spyOn(webpush, 'sendNotification').mockRejectedValue({ statusCode: 410 });

    await dispatchNewEntryNotification({
      id: 'entry-1',
      tripId: trip.id,
      authorId: String(creator._id),
      authorName: creator.displayName,
      title: 'New Story',
      content: 'Hello world',
      images: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const doc = await PushSubscription.findOne({ endpoint: 'https://push.example/member-a' });
    expect(doc?.disabledAt).toBeInstanceOf(Date);
  });
});
