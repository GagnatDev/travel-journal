import type { CreateSavedLocationRequest } from '@travel-journal/shared';

import { apiJson } from './client.js';

export interface SavedLocationResponse {
  id: string;
  tripId: string;
  lat: number;
  lng: number;
  savedByUserId: string;
  savedByDisplayName: string;
  createdAt: string;
  updatedAt: string;
  name?: string;
}

export function createSavedLocation(
  tripId: string,
  data: CreateSavedLocationRequest,
  token: string,
): Promise<SavedLocationResponse> {
  return apiJson<SavedLocationResponse>(`/api/v1/trips/${tripId}/saved-locations`, {
    method: 'POST',
    token,
    body: data,
  });
}

export function deleteSavedLocation(tripId: string, savedId: string, token: string): Promise<void> {
  return apiJson<void>(`/api/v1/trips/${tripId}/saved-locations/${savedId}`, {
    method: 'DELETE',
    token,
  });
}
