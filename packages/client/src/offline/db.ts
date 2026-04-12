import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CreateEntryRequest } from '@travel-journal/shared';

export interface PendingEntry {
  localId: string;
  tripId: string;
  status: 'pending' | 'failed';
  payload: CreateEntryRequest;
  /** Raw File/Blob objects for images that could not be uploaded while offline. */
  images: File[];
  createdAt: number;
  retryCount: number;
}

interface OfflineDBSchema extends DBSchema {
  pendingEntries: {
    key: string;
    value: PendingEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

export async function getPendingEntriesForTrip(tripId: string): Promise<PendingEntry[]> {
  const db = await getOfflineDB();
  const all = await db.getAll('pendingEntries');
  return all.filter((e) => e.tripId === tripId);
}

export async function getPendingEntry(localId: string): Promise<PendingEntry | undefined> {
  const db = await getOfflineDB();
  return db.get('pendingEntries', localId);
}

export function getOfflineDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>('travel-journal-offline', 1, {
      upgrade(db) {
        db.createObjectStore('pendingEntries', { keyPath: 'localId' });
      },
    });
  }
  return dbPromise;
}
