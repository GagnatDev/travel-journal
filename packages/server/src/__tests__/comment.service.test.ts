import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { Entry } from '../models/Entry.model.js';
import { Comment } from '../models/Comment.model.js';
import { hashPassword } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';
import { createEntry } from '../services/entry.service.js';
import { addComment, deleteComment, listComments } from '../services/comment.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ??
  'mongodb://localhost:27017/travel-journal-test-comment-service';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await Entry.deleteMany({});
  await Comment.deleteMany({});
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

describe('addComment', () => {
  it('creates a comment and returns it with author name', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    const comment = await addComment(trip.id, entry.id, String(user._id), 'Hello world', 'creator');

    expect(comment.content).toBe('Hello world');
    expect(comment.authorId).toBe(String(user._id));
    expect(comment.authorName).toBe('user');
    expect(comment.entryId).toBe(entry.id);
    expect(comment.tripId).toBe(trip.id);
  });

  it('trims whitespace from content', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    const comment = await addComment(trip.id, entry.id, String(user._id), '  trimmed  ', 'creator');
    expect(comment.content).toBe('trimmed');
  });

  it('throws 400 for empty content', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    await expect(
      addComment(trip.id, entry.id, String(user._id), '   ', 'creator'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when content exceeds 1000 characters', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    await expect(
      addComment(trip.id, entry.id, String(user._id), 'a'.repeat(1001), 'creator'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 404 when entryId does not belong to tripId', async () => {
    const user = await makeUser('user@test.com');
    const tripA = await createTrip({ name: 'A' }, String(user._id));
    const tripB = await createTrip({ name: 'B' }, String(user._id));
    const entryInA = await createEntry(tripA.id, String(user._id), { title: 'E', content: 'c' });

    await expect(
      addComment(tripB.id, entryInA.id, String(user._id), 'cross trip', 'creator'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('listComments', () => {
  it('returns comments sorted oldest first, excluding soft-deleted', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    const c1 = await addComment(trip.id, entry.id, String(user._id), 'First', 'creator');
    const c2 = await addComment(trip.id, entry.id, String(user._id), 'Second', 'creator');

    // Soft-delete c1
    await Comment.updateOne({ _id: c1.id }, { deletedAt: new Date() });

    const comments = await listComments(trip.id, entry.id, 'creator');

    expect(comments).toHaveLength(1);
    expect(comments[0]!.id).toBe(c2.id);
    expect(comments[0]!.content).toBe('Second');
  });

  it('throws 404 for unknown entryId', async () => {
    const user = await makeUser('solo@test.com');
    const trip = await createTrip({ name: 'T' }, String(user._id));
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    await expect(listComments(trip.id, fakeId, 'creator')).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteComment', () => {
  it('soft-deletes a comment when the requester is the author', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    const comment = await addComment(trip.id, entry.id, String(user._id), 'To delete', 'creator');
    await deleteComment(trip.id, entry.id, comment.id, String(user._id), 'creator');

    const remaining = await listComments(trip.id, entry.id, 'creator');
    expect(remaining).toHaveLength(0);

    // Document still exists with deletedAt set
    const doc = await Comment.findById(comment.id);
    expect(doc).not.toBeNull();
    expect(doc?.deletedAt).not.toBeNull();
  });

  it('throws 403 when the requester is not the author', async () => {
    const author = await makeUser('author@test.com');
    const other = await makeUser('other@test.com');
    const trip = await createTrip({ name: 'Test' }, String(author._id));
    const entry = await createEntry(trip.id, String(author._id), { title: 'E', content: 'c' });

    const comment = await addComment(trip.id, entry.id, String(author._id), 'Mine', 'creator');

    await expect(
      deleteComment(trip.id, entry.id, comment.id, String(other._id), 'creator'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws 404 for a non-existent comment', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });
    const fakeId = new mongoose.Types.ObjectId().toHexString();

    await expect(
      deleteComment(trip.id, entry.id, fakeId, String(user._id), 'creator'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
