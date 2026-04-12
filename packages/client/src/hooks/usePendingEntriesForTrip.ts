import { useEffect, useState } from 'react';

import { getPendingEntriesForTrip } from '../offline/db.js';
import type { PendingEntry } from '../offline/db.js';
import { PENDING_CHANGED_EVENT } from '../offline/entrySync.js';

/** Pending offline entries for a trip; refreshes when the outbox changes. */
export function usePendingEntriesForTrip(tripId: string | undefined): PendingEntry[] {
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    async function refresh() {
      try {
        const entries = await getPendingEntriesForTrip(tripId);
        if (!cancelled) setPendingEntries(entries);
      } catch {
        // IDB unavailable — show nothing
      }
    }

    void refresh();
    window.addEventListener(PENDING_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PENDING_CHANGED_EVENT, refresh);
    };
  }, [tripId]);

  return pendingEntries;
}
