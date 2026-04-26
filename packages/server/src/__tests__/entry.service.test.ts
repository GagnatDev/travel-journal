import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { Entry } from '../models/Entry.model.js';
import { hashPassword } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';
import {
  assertCanManageTripEntry,
  assertEntryAuthor,
  createEntry,
  getEntryById,
  listEntries,
  normalizeImageOrder,
  softDeleteEntry,
  tryParseClientCreatedAt,
  updateEntry,
} from '../services/entry.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-entry-service';

beforeAll(async () => {
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

async function makeUser(email: string, appRole: 'admin' | 'creator' | 'follower' = 'creator') {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0]!,
    appRole,
  });
}

async function makeTrip(creatorId: string) {
  return createTrip({ name: 'Test Trip' }, creatorId);
}

describe('normalizeImageOrder', () => {
  it('sorts by order and reassigns to 0, 1, 2...', () => {
    const images = [
      { key: 'c', width: 100, height: 100, order: 5, uploadedAt: '2024-01-01T00:00:00.000Z' },
      { key: 'a', width: 100, height: 100, order: 1, uploadedAt: '2024-01-01T00:00:00.000Z' },
      { key: 'b', width: 100, height: 100, order: 3, uploadedAt: '2024-01-01T00:00:00.000Z' },
    ];
    const result = normalizeImageOrder(images);
    expect(result).toHaveLength(3);
    expect(result[0]!.key).toBe('a');
    expect(result[0]!.order).toBe(0);
    expect(result[1]!.key).toBe('b');
    expect(result[1]!.order).toBe(1);
    expect(result[2]!.key).toBe('c');
    expect(result[2]!.order).toBe(2);
  });

  it('handles an empty array', () => {
    expect(normalizeImageOrder([])).toEqual([]);
  });

  it('handles a single image', () => {
    const images = [
      { key: 'a', width: 100, height: 100, order: 99, uploadedAt: '2024-01-01T00:00:00.000Z' },
    ];
    const result = normalizeImageOrder(images);
    expect(result[0]!.order).toBe(0);
  });

  it('does not mutate the original array', () => {
    const images = [
      { key: 'a', width: 100, height: 100, order: 5, uploadedAt: '2024-01-01T00:00:00.000Z' },
      { key: 'b', width: 100, height: 100, order: 0, uploadedAt: '2024-01-01T00:00:00.000Z' },
    ];
    normalizeImageOrder(images);
    expect(images[0]!.order).toBe(5);
    expect(images[1]!.order).toBe(0);
  });
});

describe('assertCanManageTripEntry', () => {
  it('throws for follower', () => {
    expect(() => assertCanManageTripEntry('follower')).toThrow(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
  });

  it('allows creator and contributor', () => {
    expect(() => assertCanManageTripEntry('creator')).not.toThrow();
    expect(() => assertCanManageTripEntry('contributor')).not.toThrow();
  });
});

describe('assertEntryAuthor', () => {
  it('throws 403 for a non-author userId', async () => {
    const user = await makeUser('creator@test.com');
    const other = await makeUser('other@test.com', 'follower');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'Test',
      content: 'Content',
    });

    expect(() => assertEntryAuthor(entry, String(other._id))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('passes silently for the author', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'Test',
      content: 'Content',
    });

    expect(() => assertEntryAuthor(entry, String(user._id))).not.toThrow();
  });
});

describe('tryParseClientCreatedAt', () => {
  it('accepts a recent past ISO string', () => {
    const d = new Date(Date.now() - 60_000);
    const parsed = tryParseClientCreatedAt(d.toISOString());
    expect(parsed).not.toBeNull();
    expect(parsed!.getTime()).toBe(d.getTime());
  });

  it('rejects invalid and out-of-range dates', () => {
    expect(tryParseClientCreatedAt('not-a-date')).toBeNull();
    expect(tryParseClientCreatedAt(new Date(Date.now() + 10 * 60_000).toISOString())).toBeNull();
    expect(tryParseClientCreatedAt(new Date(Date.now() - 400 * 24 * 60 * 60_000).toISOString())).toBeNull();
  });
});

describe('listEntries and drafts', () => {
  it('excludes drafts from follower list but includes them for creator', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await makeTrip(String(creator._id));

    const pub = await createEntry(trip.id, String(creator._id), {
      title: 'Published',
      content: 'x',
    });
    const draft = await createEntry(trip.id, String(creator._id), {
      title: 'Draft',
      content: 'y',
      publicationStatus: 'draft',
    });

    const forFollower = await listEntries(trip.id, 1, 20, 'follower');
    expect(forFollower.entries.map((e) => e.id)).toEqual([pub.id]);
    expect(forFollower.total).toBe(1);

    const forCreator = await listEntries(trip.id, 1, 20, 'creator');
    expect(forCreator.total).toBe(2);
    expect(forCreator.entries.find((e) => e.id === draft.id)?.publicationStatus).toBe('draft');
  });
});

describe('createEntry', () => {
  it('stores the entry with deletedAt null and returns it with authorName', async () => {
    const user = await makeUser('author@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'My Entry',
      content: 'Hello world',
    });

    expect(entry.title).toBe('My Entry');
    expect(entry.content).toBe('Hello world');
    expect(entry.authorName).toBe('author');
    expect(entry.authorId).toBe(String(user._id));
    expect(entry.tripId).toBe(trip.id);
    expect(entry.publicationStatus).toBeUndefined();

    // Verify deletedAt is null in DB
    const doc = await Entry.findById(entry.id);
    expect(doc?.deletedAt).toBeNull();
    expect(doc?.publicationStatus).toBe('published');
  });

  it('stores draft and exposes publicationStatus in API shape', async () => {
    const user = await makeUser('draft@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'WIP',
      content: 'Soon',
      publicationStatus: 'draft',
    });

    expect(entry.publicationStatus).toBe('draft');
    const doc = await Entry.findById(entry.id).lean();
    expect(doc?.publicationStatus).toBe('draft');
  });

  it('honors clientCreatedAt for Mongo createdAt when provided', async () => {
    const user = await makeUser('author2@test.com');
    const trip = await makeTrip(String(user._id));
    const clientAt = new Date(Date.now() - 3 * 24 * 60 * 60_000);

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'Synced offline',
      content: 'Body',
      clientCreatedAt: clientAt.toISOString(),
    });

    const doc = await Entry.findById(entry.id).lean();
    expect(doc?.createdAt).toBeDefined();
    expect(new Date(doc!.createdAt).getTime()).toBe(clientAt.getTime());
    expect(entry.createdAt).toBe(clientAt.toISOString());
  });
});

describe('listEntries', () => {
  it('excludes soft-deleted entries', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const e1 = await createEntry(trip.id, String(user._id), { title: 'Active', content: 'ok' });
    const e2 = await createEntry(trip.id, String(user._id), {
      title: 'Deleted',
      content: 'gone',
    });
    await softDeleteEntry(trip.id, e2.id, 'creator');

    const { entries, total } = await listEntries(trip.id, 1, 20, 'creator');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe(e1.id);
    expect(total).toBe(1);
  });

  it('returns results in reverse-chronological order', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const e1 = await createEntry(trip.id, String(user._id), { title: 'First', content: 'a' });
    // Small delay to ensure different createdAt timestamps
    await new Promise((r) => setTimeout(r, 10));
    const e2 = await createEntry(trip.id, String(user._id), { title: 'Second', content: 'b' });

    const { entries } = await listEntries(trip.id, 1, 20, 'creator');
    expect(entries[0]!.id).toBe(e2.id); // newest first
    expect(entries[1]!.id).toBe(e1.id);
  });

  it('respects page and limit', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    for (let i = 0; i < 5; i++) {
      await createEntry(trip.id, String(user._id), { title: `Entry ${i}`, content: 'x' });
    }

    const page1 = await listEntries(trip.id, 1, 3, 'creator');
    expect(page1.entries).toHaveLength(3);
    expect(page1.total).toBe(5);

    const page2 = await listEntries(trip.id, 2, 3, 'creator');
    expect(page2.entries).toHaveLength(2);
    expect(page2.total).toBe(5);
  });
});

describe('updateEntry', () => {
  it('throws 403 for follower trip role', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await makeTrip(String(creator._id));

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'Original',
      content: 'content',
    });

    await expect(updateEntry(trip.id, entry.id, 'follower', { title: 'Changed' })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('allows contributor to update another member entry', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await makeTrip(String(creator._id));

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'Original',
      content: 'old',
    });

    const updated = await updateEntry(trip.id, entry.id, 'contributor', {
      title: 'Updated',
      content: 'new',
    });

    expect(updated.title).toBe('Updated');
    expect(updated.content).toBe('new');
    expect(updated.authorId).toBe(String(creator._id));
  });

  it('updates title and content for trip creator role', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'Original',
      content: 'old',
    });

    const updated = await updateEntry(trip.id, entry.id, 'creator', {
      title: 'Updated',
      content: 'new',
    });

    expect(updated.title).toBe('Updated');
    expect(updated.content).toBe('new');
  });

  it('clears location when null is provided', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'Entry',
      content: 'content',
      location: { lat: 10, lng: 20, name: 'Place' },
    });

    expect(entry.location).toBeDefined();

    const updated = await updateEntry(trip.id, entry.id, 'creator', {
      location: null,
    });

    expect(updated.location).toBeUndefined();
  });

  it('sets publicationStatus to published from draft', async () => {
    const user = await makeUser('pub@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'D',
      content: 'c',
      publicationStatus: 'draft',
    });
    expect(entry.publicationStatus).toBe('draft');

    const updated = await updateEntry(trip.id, entry.id, 'creator', {
      publicationStatus: 'published',
    });
    expect(updated.publicationStatus).toBeUndefined();

    const doc = await Entry.findById(entry.id).lean();
    expect(doc?.publicationStatus).toBe('published');
  });
});

describe('softDeleteEntry', () => {
  it('sets deletedAt to a timestamp without removing the document', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'To Delete',
      content: 'content',
    });

    await softDeleteEntry(trip.id, entry.id, 'creator');

    const doc = await Entry.findById(entry.id);
    expect(doc).not.toBeNull();
    expect(doc?.deletedAt).not.toBeNull();
  });

  it('subsequent listEntries does not return the soft-deleted entry', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'To Delete',
      content: 'content',
    });

    await softDeleteEntry(trip.id, entry.id, 'creator');

    const { entries } = await listEntries(trip.id, 1, 20, 'creator');
    expect(entries.find((e) => e.id === entry.id)).toBeUndefined();
  });

  it('throws 403 for follower trip role', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await makeTrip(String(creator._id));

    const entry = await createEntry(trip.id, String(creator._id), {
      title: 'Mine',
      content: 'content',
    });

    await expect(softDeleteEntry(trip.id, entry.id, 'follower')).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('getEntryById', () => {
  it('returns the entry when found', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'Found',
      content: 'here',
    });

    const found = await getEntryById(trip.id, entry.id, 'creator');
    expect(found.id).toBe(entry.id);
    expect(found.title).toBe('Found');
  });

  it('throws 404 for a soft-deleted entry', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'Gone',
      content: 'content',
    });
    await softDeleteEntry(trip.id, entry.id, 'creator');

    await expect(getEntryById(trip.id, entry.id, 'creator')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('hides draft from follower role', async () => {
    const user = await makeUser('creator@test.com');
    const trip = await makeTrip(String(user._id));

    const entry = await createEntry(trip.id, String(user._id), {
      title: 'Secret',
      content: 'draft',
      publicationStatus: 'draft',
    });

    const forCreator = await getEntryById(trip.id, entry.id, 'creator');
    expect(forCreator.id).toBe(entry.id);

    await expect(getEntryById(trip.id, entry.id, 'follower')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});
