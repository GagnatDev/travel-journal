import { useMemo } from 'react';
import type { MapPin } from '@travel-journal/shared';

import type { PendingSavedLocation } from '../../../offline/db.js';
import type { MapRenderablePin } from '../types.js';
import { getPinSortTime } from '../types.js';

export function usePinsForMap(
  pins: MapPin[] | undefined,
  pendingOfflineSaved: PendingSavedLocation[],
): MapRenderablePin[] {
  return useMemo(() => {
    const serverPins = pins ?? [];
    const pendPins: MapRenderablePin[] = pendingOfflineSaved.map((row) => ({
      kind: 'pendingSavedLocation' as const,
      localId: row.localId,
      lat: row.payload.lat,
      lng: row.payload.lng,
      createdAt: new Date(row.capturedAt).toISOString(),
      ...(row.payload.name !== undefined && row.payload.name.trim() !== ''
        ? { name: row.payload.name.trim() }
        : {}),
    }));

    const list: MapRenderablePin[] = [...serverPins, ...pendPins];
    list.sort((a, b) => getPinSortTime(b) - getPinSortTime(a));
    return list;
  }, [pins, pendingOfflineSaved]);
}
