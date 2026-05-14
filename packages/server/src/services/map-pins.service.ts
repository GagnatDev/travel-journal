import type { MapPin } from '@travel-journal/shared';

import { listEntryLocations } from './entry.service.js';
import { listSavedLocationsForTrip } from './saved-location.service.js';

/** Map pins: entry locations + quick-saved bookmarks (newest-heavy sort by createdAt descending per kind, then merged by recency — we sort unified array). */
export async function listMapPins(tripId: string): Promise<MapPin[]> {
  const [entries, saved] = await Promise.all([
    listEntryLocations(tripId),
    listSavedLocationsForTrip(tripId),
  ]);

  const pins: MapPin[] = [];

  for (const e of entries) {
    pins.push({
      kind: 'entry',
      entryId: e.entryId,
      title: e.title,
      lat: e.lat,
      lng: e.lng,
      ...(e.name !== undefined && { name: e.name }),
      createdAt: e.createdAt,
    });
  }

  for (const s of saved) {
    pins.push({
      kind: 'savedLocation',
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      createdAt: s.createdAt,
      savedByUserId: s.savedByUserId,
      savedByDisplayName: s.savedByDisplayName,
      ...(s.name !== undefined && { name: s.name }),
    });
  }

  pins.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return pins;
}
