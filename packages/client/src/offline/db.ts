import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CreateEntryRequest, CreateSavedLocationRequest } from '@travel-journal/shared';

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

export interface PendingSavedLocation {
  localId: string;
  tripId: string;
  status: 'pending' | 'failed';
  payload: CreateSavedLocationRequest;
  capturedAt: number;
  retryCount: number;
}

interface OfflineDBSchema extends DBSchema {
  pendingEntries: {
    key: string;
    value: PendingEntry;
  };
  pendingSavedLocations: {
    key: string;
    value: PendingSavedLocation;
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

export async function getPendingSavedLocationsForTrip(tripId: string): Promise<PendingSavedLocation[]> {
  const db = await getOfflineDB();
  const all = await db.getAll('pendingSavedLocations');
  return all.filter((e) => e.tripId === tripId);
}

export function getOfflineDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>('travel-journal-offline', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('pendingEntries', { keyPath: 'localId' });
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains('pendingSavedLocations')) {
          db.createObjectStore('pendingSavedLocations', { keyPath: 'localId' });
        }
      },
    });
  }
  return dbPromise;
}
