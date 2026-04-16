import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import webpush from 'web-push';

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
  it('notifies eligible members and excludes author/disabled recipients', async () => {
    const creator = await makeUser('creator@test.com', 'creator');
    const followerA = await makeUser('a@test.com', 'follower');
    const followerB = await makeUser('b@test.com', 'follower');
    const trip = await createTrip({ name: 'Nordic Adventure' }, String(creator._id));

    await Trip.updateOne(
      { _id: trip.id },
      {
        $push: {
          members: [
            {
              userId: followerA._id,
              tripRole: 'follower',
              addedAt: new Date(),
              notificationPreferences: { newEntriesPushEnabled: true },
            },
            {
              userId: followerB._id,
              tripRole: 'follower',
              addedAt: new Date(),
              notificationPreferences: { newEntriesPushEnabled: false },
            },
          ],
        },
      },
    );

    await PushSubscription.create([
      {
        userId: followerA._id,
        endpoint: 'https://push.example/member-a',
        keys: { p256dh: 'a', auth: 'a' },
      },
      {
        userId: followerB._id,
        endpoint: 'https://push.example/member-b',
        keys: { p256dh: 'b', auth: 'b' },
      },
      {
        userId: creator._id,
        endpoint: 'https://push.example/creator',
        keys: { p256dh: 'c', auth: 'c' },
      },
    ]);

    const sendSpy = vi
      .spyOn(webpush, 'sendNotification')
      .mockResolvedValue({} as never);

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
    const [subscriptionArg] = sendSpy.mock.calls[0]!;
    expect(subscriptionArg.endpoint).toBe('https://push.example/member-a');
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
            notificationPreferences: { newEntriesPushEnabled: true },
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
