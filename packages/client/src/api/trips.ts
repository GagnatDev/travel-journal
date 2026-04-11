import type { Invite, Trip } from '@travel-journal/shared';

import { apiJson, apiJsonIfOk } from './client.js';

export function fetchTrip(tripId: string, token: string): Promise<Trip> {
  return apiJson<Trip>(`/api/v1/trips/${tripId}`, { token });
}

export function fetchTrips(token: string): Promise<Trip[]> {
  return apiJson<Trip[]>('/api/v1/trips', { token });
}

/** Non-OK responses yield an empty list (legacy behavior). */
export async function fetchTripInvites(tripId: string, token: string): Promise<Invite[]> {
  const data = await apiJsonIfOk<Invite[]>(`/api/v1/trips/${tripId}/members/invites`, { token });
  return data ?? [];
}
