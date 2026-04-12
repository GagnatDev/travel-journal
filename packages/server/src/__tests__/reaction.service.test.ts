import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { Entry } from '../models/Entry.model.js';
import { hashPassword } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';
import { createEntry } from '../services/entry.service.js';
import { toggleReaction } from '../services/reaction.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ??
  'mongodb://localhost:27017/travel-journal-test-reaction-service';

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

async function makeUser(email: string) {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0]!,
    appRole: 'creator',
  });
}

describe('toggleReaction', () => {
  it('adds a reaction when the user has not yet reacted with that emoji', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    const reactions = await toggleReaction(trip.id, entry.id, String(user._id), '❤️');

    expect(reactions).toHaveLength(1);
    expect(reactions[0]!.emoji).toBe('❤️');
    expect(reactions[0]!.userId).toBe(String(user._id));
  });

  it('removes the reaction when the same user reacts again with the same emoji (toggle off)', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    await toggleReaction(trip.id, entry.id, String(user._id), '👍');
    const reactions = await toggleReaction(trip.id, entry.id, String(user._id), '👍');

    expect(reactions).toHaveLength(0);
  });

  it('allows different emojis from the same user on the same entry', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    await toggleReaction(trip.id, entry.id, String(user._id), '❤️');
    const reactions = await toggleReaction(trip.id, entry.id, String(user._id), '😂');

    expect(reactions).toHaveLength(2);
    expect(reactions.map((r) => r.emoji).sort()).toEqual(['❤️', '😂'].sort());
  });

  it('allows multiple users to react with the same emoji', async () => {
    const user1 = await makeUser('user1@test.com');
    const user2 = await makeUser('user2@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user1._id));
    const entry = await createEntry(trip.id, String(user1._id), { title: 'E', content: 'c' });

    await toggleReaction(trip.id, entry.id, String(user1._id), '❤️');
    const reactions = await toggleReaction(trip.id, entry.id, String(user2._id), '❤️');

    expect(reactions).toHaveLength(2);
    expect(reactions.every((r) => r.emoji === '❤️')).toBe(true);
  });

  it('throws 404 for a non-existent entry', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const fakeId = new mongoose.Types.ObjectId().toHexString();

    await expect(
      toggleReaction(trip.id, fakeId, String(user._id), '❤️'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 for invalid entry id format', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));

    await expect(
      toggleReaction(trip.id, 'not-an-id', String(user._id), '❤️'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
