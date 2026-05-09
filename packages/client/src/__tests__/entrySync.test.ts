import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

import { createEntry } from '../api/entries.js';
import { saveOfflineEntry, getPendingCount, syncPendingEntries } from '../offline/entrySync.js';

// ------------------------------------------------------------------
// Mock the IDB layer — jsdom does not implement IndexedDB natively
// ------------------------------------------------------------------
type StoreName = 'pendingEntries' | 'pendingSavedLocations';

const bucket: Record<StoreName, Map<string, object>> = {
  pendingEntries: new Map(),
  pendingSavedLocations: new Map(),
};

const mockDb = {
  put: vi.fn(async (storeName: string, value: { localId: string }) => {
    const name = storeName === 'pendingSavedLocations' ? 'pendingSavedLocations' : 'pendingEntries';
    bucket[name].set(value.localId, value);
  }),
  get: vi.fn(async (storeName: string, key: string) => bucket[storeName as StoreName]?.get(key)),
  getAll: vi.fn(async (storeName: string) => Array.from(bucket[storeName as StoreName]?.values() ?? [])),
  delete: vi.fn(async (storeName: string, key: string) => {
    bucket[storeName as StoreName]?.delete(key);
  }),
  count: vi.fn(async (storeName?: string) => {
    const name =
      storeName === 'pendingSavedLocations' ? 'pendingSavedLocations' : 'pendingEntries';
    return bucket[name].size;
  }),
};

vi.mock('../offline/db.js', () => ({
  getOfflineDB: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('../api/entries.js', () => ({
  createEntry: vi.fn(() => Promise.resolve({ id: 'entry-1' })),
}));

vi.mock('../api/media.js', () => ({
  uploadMedia: vi.fn(() => Promise.resolve({ key: 'media-key-1', url: 'http://example.com/1' })),
}));

vi.mock('../utils/compressImage.js', () => ({
  compressImage: vi.fn(() => Promise.resolve({ blob: new Blob(), width: 800, height: 600 })),
}));

const baseEntry = {
  localId: 'local-1',
  tripId: 'trip-1',
  status: 'pending' as const,
  payload: { title: 'Offline Entry', content: 'Written offline.', images: [] },
  images: [] as File[],
  createdAt: Date.now(),
};

beforeEach(() => {
  bucket.pendingEntries.clear();
  bucket.pendingSavedLocations.clear();
  vi.clearAllMocks();
  mockDb.put.mockImplementation(async (storeName: string, value: { localId: string }) => {
    const name = storeName === 'pendingSavedLocations' ? 'pendingSavedLocations' : 'pendingEntries';
    bucket[name].set(value.localId, value);
  });
  mockDb.getAll.mockImplementation(async (storeName: string) =>
    Array.from(bucket[storeName as StoreName]?.values() ?? []),
  );
  mockDb.delete.mockImplementation(async (storeName: string, key: string) => {
    bucket[storeName as StoreName]?.delete(key);
  });
  mockDb.count.mockImplementation(async (storeName?: string) => {
    const name =
      storeName === 'pendingSavedLocations' ? 'pendingSavedLocations' : 'pendingEntries';
    return bucket[name].size;
  });
});

describe('saveOfflineEntry', () => {
  it('stores the entry in IDB with retryCount 0', async () => {
    await saveOfflineEntry(baseEntry);
    expect(mockDb.put).toHaveBeenCalledWith(
      'pendingEntries',
      expect.objectContaining({ localId: 'local-1', retryCount: 0 }),
    );
  });

  it('dispatches pendingEntriesChanged event', async () => {
    const spy = vi.fn();
    window.addEventListener('pendingEntriesChanged', spy);
    await saveOfflineEntry(baseEntry);
    window.removeEventListener('pendingEntriesChanged', spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('getPendingCount', () => {
  it('returns 0 when store is empty', async () => {
    expect(await getPendingCount()).toBe(0);
  });

  it('returns correct count after entries are added', async () => {
    await saveOfflineEntry(baseEntry);
    await saveOfflineEntry({ ...baseEntry, localId: 'local-2' });
    expect(await getPendingCount()).toBe(2);
  });
});

describe('syncPendingEntries', () => {
  it('creates entries and removes them from IDB on success', async () => {
    await saveOfflineEntry(baseEntry);

    const onEntryCreated = vi.fn();
    await syncPendingEntries('token-abc', onEntryCreated);

    expect(createEntry).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({
        title: 'Offline Entry',
        clientCreatedAt: new Date(baseEntry.createdAt).toISOString(),
      }),
      'token-abc',
    );
    expect(mockDb.delete).toHaveBeenCalledWith('pendingEntries', 'local-1');
    expect(onEntryCreated).toHaveBeenCalledWith('trip-1');
  });

  it('marks entry as failed and increments retryCount on network error', async () => {
    await saveOfflineEntry(baseEntry);
    (createEntry as Mock).mockRejectedValueOnce(new Error('Network error'));

    await syncPendingEntries('token-abc', vi.fn());

    expect(mockDb.put).toHaveBeenLastCalledWith(
      'pendingEntries',
      expect.objectContaining({ status: 'failed', retryCount: 1 }),
    );
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('uploads raw files and includes resulting keys in the entry payload', async () => {
    const mockFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await saveOfflineEntry({ ...baseEntry, images: [mockFile] });

    await syncPendingEntries('token-abc', vi.fn());

    expect(createEntry).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({
        images: expect.arrayContaining([
          expect.objectContaining({ key: 'media-key-1' }),
        ]),
      }),
      'token-abc',
    );
  });

  it('is a no-op when there are no pending entries', async () => {
    const onEntryCreated = vi.fn();
    await syncPendingEntries('token-abc', onEntryCreated);
    expect(createEntry).not.toHaveBeenCalled();
    expect(onEntryCreated).not.toHaveBeenCalled();
  });

  it('omits clientCreatedAt when syncing entry that preserves saved-location timestamp', async () => {
    const savedId = '507f1f77bcf86cd799439011';
    await saveOfflineEntry({
      ...baseEntry,
      payload: {
        ...baseEntry.payload,
        consumedSavedLocationId: savedId,
        useSavedLocationCreatedAt: true,
      },
    });

    await syncPendingEntries('token-abc', vi.fn());

    expect(createEntry).toHaveBeenCalledTimes(1);
    const sent = (createEntry as Mock).mock.calls[0][1] as {
      clientCreatedAt?: string;
      useSavedLocationCreatedAt?: boolean;
      consumedSavedLocationId?: string;
    };
    expect(sent).not.toHaveProperty('clientCreatedAt');
    expect(sent.useSavedLocationCreatedAt).toBe(true);
    expect(sent.consumedSavedLocationId).toBe(savedId);
  });
});
