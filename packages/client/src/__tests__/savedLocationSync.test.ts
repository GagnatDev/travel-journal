import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

import { createSavedLocation } from '../api/savedLocations.js';
import {
  removePendingSavedLocationFromQueue,
  saveOfflineSavedLocation,
  syncPendingSavedLocations,
} from '../offline/savedLocationSync.js';

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
  getAll: vi.fn(async (storeName: string) =>
    Array.from(bucket[storeName as StoreName]?.values() ?? []),
  ),
  delete: vi.fn(async (storeName: string, key: string) => {
    bucket[storeName as StoreName]?.delete(key);
  }),
};

vi.mock('../offline/db.js', () => ({
  getOfflineDB: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('../api/savedLocations.js', () => ({
  createSavedLocation: vi.fn(() => Promise.resolve({ id: 'srv-1' })),
}));

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
});

const baseQueued = {
  localId: 'loc-1',
  tripId: 'trip-x',
  status: 'pending' as const,
  payload: { lat: 1, lng: 2, name: 'X' },
  capturedAt: Date.now(),
};

describe('saveOfflineSavedLocation', () => {
  it('writes pendingSavedLocations and dispatches pendingSavedLocationsChanged', async () => {
    const spy = vi.fn();
    window.addEventListener('pendingSavedLocationsChanged', spy);
    await saveOfflineSavedLocation(baseQueued);

    window.removeEventListener('pendingSavedLocationsChanged', spy);
    expect(mockDb.put).toHaveBeenCalledWith(
      'pendingSavedLocations',
      expect.objectContaining({ localId: 'loc-1', retryCount: 0 }),
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('removePendingSavedLocationFromQueue', () => {
  it('deletes pending row and notifies', async () => {
    await saveOfflineSavedLocation(baseQueued);

    await removePendingSavedLocationFromQueue('loc-1');

    expect(bucket.pendingSavedLocations.size).toBe(0);
  });
});

describe('syncPendingSavedLocations', () => {
  it('POSTs queued spots and clears IDB', async () => {
    await saveOfflineSavedLocation(baseQueued);
    const onSynced = vi.fn();

    await syncPendingSavedLocations('tok', onSynced);

    expect(createSavedLocation).toHaveBeenCalledWith('trip-x', { lat: 1, lng: 2, name: 'X' }, 'tok');
    expect(bucket.pendingSavedLocations.size).toBe(0);
    expect(onSynced).toHaveBeenCalledWith('trip-x');
  });

  it('marks row failed when API rejects', async () => {
    await saveOfflineSavedLocation(baseQueued);
    (createSavedLocation as Mock).mockRejectedValueOnce(new Error('boom'));

    await syncPendingSavedLocations('tok', vi.fn());

    const rows = [...bucket.pendingSavedLocations.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'failed',
      retryCount: 1,
      localId: 'loc-1',
    });
  });
});
