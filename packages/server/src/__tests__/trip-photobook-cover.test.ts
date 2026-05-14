import { describe, it, expect } from 'vitest';
import type { Entry, Trip } from '@travel-journal/shared';

import { resolvePhotobookCoverKey } from '../services/trip-photobook-pdf.service.js';

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip1',
    name: 'T',
    status: 'active',
    createdBy: 'u1',
    allowContributorInvites: false,
    members: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function entryWithImage(key: string): Entry {
  return {
    id: 'e1',
    tripId: 'trip1',
    authorId: 'u1',
    authorName: 'A',
    title: 'Day',
    content: 'x',
    images: [
      {
        key,
        width: 1,
        height: 1,
        order: 0,
        uploadedAt: new Date().toISOString(),
      },
    ],
    reactions: [],
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
  };
}

describe('resolvePhotobookCoverKey', () => {
  it('uses photobookCoverImageKey when it matches a trip entry image', () => {
    const keyA = 'media/trip1/a.jpg';
    const keyB = 'media/trip1/b.jpg';
    const trip = baseTrip({ photobookCoverImageKey: keyB });
    const entries = [entryWithImage(keyA), entryWithImage(keyB)];
    expect(resolvePhotobookCoverKey(trip, entries)).toBe(keyB);
  });

  it('falls back to random when photobookCoverImageKey is not among trip images', () => {
    const trip = baseTrip({ photobookCoverImageKey: 'media/trip1/ghost.jpg' });
    const entries = [entryWithImage('media/trip1/a.jpg')];
    const got = resolvePhotobookCoverKey(trip, entries);
    expect(got).toBe('media/trip1/a.jpg');
  });

  it('returns undefined when there are no images', () => {
    const trip = baseTrip({ photobookCoverImageKey: 'media/trip1/x.jpg' });
    const emptyEntry: Entry = {
      ...entryWithImage('media/trip1/a.jpg'),
      images: [],
    };
    expect(resolvePhotobookCoverKey(trip, [emptyEntry])).toBeUndefined();
  });
});
