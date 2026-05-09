import { useEffect, useState } from 'react';

import { getPendingSavedLocationsForTrip } from '../offline/db.js';
import type { PendingSavedLocation } from '../offline/db.js';
import { PENDING_SAVED_LOCATIONS_CHANGED_EVENT } from '../offline/savedLocationSync.js';

/** Pending offline saved map spots for a trip; refreshes when the outbox changes. */
export function usePendingSavedLocationsForTrip(tripId: string | undefined): PendingSavedLocation[] {
  const [rows, setRows] = useState<PendingSavedLocation[]>([]);

  useEffect(() => {
    if (!tripId) return;
    const id = tripId;
    let cancelled = false;

    async function refresh() {
      try {
        const list = await getPendingSavedLocationsForTrip(id);
        if (!cancelled) setRows(list);
      } catch {
        /* IDB unavailable */
      }
    }

    void refresh();
    window.addEventListener(PENDING_SAVED_LOCATIONS_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PENDING_SAVED_LOCATIONS_CHANGED_EVENT, refresh);
    };
  }, [tripId]);

  return rows;
}
