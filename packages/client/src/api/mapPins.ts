import type { MapPin } from '@travel-journal/shared';

import { apiJson } from './client.js';

export function fetchMapPins(tripId: string, token: string): Promise<MapPin[]> {
  return apiJson<MapPin[]>(`/api/v1/trips/${tripId}/map-pins`, { token });
}
