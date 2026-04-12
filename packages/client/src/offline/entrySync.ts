import { getOfflineDB, type PendingEntry } from './db.js';
import { createEntry } from '../api/entries.js';
import { uploadMedia } from '../api/media.js';
import { compressImage } from '../utils/compressImage.js';

/** Dispatched whenever the pendingEntries store changes so UI can refresh counts. */
const PENDING_CHANGED_EVENT = 'pendingEntriesChanged';

function notifyPendingChanged() {
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
}

export { PENDING_CHANGED_EVENT };

export async function saveOfflineEntry(
  entry: Omit<PendingEntry, 'retryCount'>,
): Promise<void> {
  const db = await getOfflineDB();
  await db.put('pendingEntries', { ...entry, retryCount: 0 });
  notifyPendingChanged();
}

export async function getPendingCount(): Promise<number> {
  const db = await getOfflineDB();
  return db.count('pendingEntries');
}

export async function getFailedCount(): Promise<number> {
  const db = await getOfflineDB();
  const all = await db.getAll('pendingEntries');
  return all.filter((e) => e.status === 'failed').length;
}

export async function syncPendingEntries(
  token: string,
  onEntryCreated: (tripId: string) => void,
): Promise<void> {
  const db = await getOfflineDB();
  const all = await db.getAll('pendingEntries');

  for (const entry of all) {
    try {
      // Upload raw files that were queued while offline
      const uploadedImages = await Promise.all(
        entry.images.map(async (file, i) => {
          const { blob, width, height } = await compressImage(file);
          const result = await uploadMedia(entry.tripId, blob, width, height, token);
          return {
            key: result.key,
            width,
            height,
            order: (entry.payload.images?.length ?? 0) + i,
            uploadedAt: new Date().toISOString(),
          };
        }),
      );

      await createEntry(
        entry.tripId,
        {
          ...entry.payload,
          images: [...(entry.payload.images ?? []), ...uploadedImages],
        },
        token,
      );

      await db.delete('pendingEntries', entry.localId);
      onEntryCreated(entry.tripId);
    } catch {
      await db.put('pendingEntries', {
        ...entry,
        status: 'failed',
        retryCount: entry.retryCount + 1,
      });
    }
  }

  notifyPendingChanged();
}
