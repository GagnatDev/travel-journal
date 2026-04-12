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

    const comment = await addComment(trip.id, entry.id, String(user._id), 'Hello world');

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

    const comment = await addComment(trip.id, entry.id, String(user._id), '  trimmed  ');
    expect(comment.content).toBe('trimmed');
  });

  it('throws 400 for empty content', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    await expect(
      addComment(trip.id, entry.id, String(user._id), '   '),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when content exceeds 1000 characters', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    await expect(
      addComment(trip.id, entry.id, String(user._id), 'a'.repeat(1001)),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('listComments', () => {
  it('returns comments sorted oldest first, excluding soft-deleted', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    const c1 = await addComment(trip.id, entry.id, String(user._id), 'First');
    const c2 = await addComment(trip.id, entry.id, String(user._id), 'Second');

    // Soft-delete c1
    await Comment.updateOne({ _id: c1.id }, { deletedAt: new Date() });

    const comments = await listComments(entry.id);

    expect(comments).toHaveLength(1);
    expect(comments[0]!.id).toBe(c2.id);
    expect(comments[0]!.content).toBe('Second');
  });

  it('returns empty array for unknown entryId', async () => {
    const comments = await listComments(new mongoose.Types.ObjectId().toHexString());
    expect(comments).toEqual([]);
  });
});

describe('deleteComment', () => {
  it('soft-deletes a comment when the requester is the author', async () => {
    const user = await makeUser('user@test.com');
    const trip = await createTrip({ name: 'Test' }, String(user._id));
    const entry = await createEntry(trip.id, String(user._id), { title: 'E', content: 'c' });

    const comment = await addComment(trip.id, entry.id, String(user._id), 'To delete');
    await deleteComment(comment.id, String(user._id));

    const remaining = await listComments(entry.id);
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

    const comment = await addComment(trip.id, entry.id, String(author._id), 'Mine');

    await expect(
      deleteComment(comment.id, String(other._id)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws 404 for a non-existent comment', async () => {
    const user = await makeUser('user@test.com');
    const fakeId = new mongoose.Types.ObjectId().toHexString();

    await expect(deleteComment(fakeId, String(user._id))).rejects.toMatchObject({ status: 404 });
  });
});
