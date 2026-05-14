import { createSavedLocation } from '../api/savedLocations.js';
import { getOfflineDB, type PendingSavedLocation } from './db.js';

const PENDING_SAVED_LOCATIONS_CHANGED_EVENT = 'pendingSavedLocationsChanged';

function notifyPendingSavedChanged(): void {
  window.dispatchEvent(new Event(PENDING_SAVED_LOCATIONS_CHANGED_EVENT));
}

export async function removePendingSavedLocationFromQueue(localId: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete('pendingSavedLocations', localId);
  notifyPendingSavedChanged();
}

export { PENDING_SAVED_LOCATIONS_CHANGED_EVENT };

export async function saveOfflineSavedLocation(
  item: Omit<PendingSavedLocation, 'retryCount'>,
): Promise<void> {
  const db = await getOfflineDB();
  await db.put('pendingSavedLocations', { ...item, retryCount: 0 });
  notifyPendingSavedChanged();
}

export async function syncPendingSavedLocations(
  token: string,
  onSynced: (tripId: string) => void,
): Promise<void> {
  const db = await getOfflineDB();
  const all = await db.getAll('pendingSavedLocations');

  for (const row of all) {
    try {
      await createSavedLocation(row.tripId, row.payload, token);
      await db.delete('pendingSavedLocations', row.localId);
      onSynced(row.tripId);
    } catch {
      await db.put('pendingSavedLocations', {
        ...row,
        status: 'failed',
        retryCount: row.retryCount + 1,
      });
    }
  }

  notifyPendingSavedChanged();
}
