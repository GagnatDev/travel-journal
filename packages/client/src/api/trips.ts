import type {
  Invite,
  Trip,
  TripMemberInviteSuggestion,
  TripStatus,
  UpdateTripMemberNotificationPreferencesRequest,
  UpdateTripRequest,
} from '@travel-journal/shared';

import { apiJson, apiJsonIfOk } from './client.js';

export type AddTripMemberResult = { type: 'added' | 'invite_created'; inviteLink?: string };

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

export function fetchTripMemberInviteSuggestions(
  tripId: string,
  token: string,
): Promise<TripMemberInviteSuggestion[]> {
  return apiJson<TripMemberInviteSuggestion[]>(
    `/api/v1/trips/${tripId}/members/invites/suggestions`,
    { token },
  );
}

export function patchTrip(
  tripId: string,
  body: Pick<UpdateTripRequest, 'name' | 'description'>,
  token: string,
): Promise<Trip> {
  return apiJson<Trip>(`/api/v1/trips/${tripId}`, { method: 'PATCH', token, body });
}

export function patchTripStatus(
  tripId: string,
  status: TripStatus,
  token: string,
): Promise<Trip> {
  return apiJson<Trip>(`/api/v1/trips/${tripId}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
}

export function deleteTrip(tripId: string, token: string): Promise<void> {
  return apiJson<void>(`/api/v1/trips/${tripId}`, { method: 'DELETE', token });
}

export function addTripMember(
  tripId: string,
  body: { emailOrNickname: string; tripRole: 'contributor' | 'follower' },
  token: string,
): Promise<AddTripMemberResult> {
  return apiJson<AddTripMemberResult>(`/api/v1/trips/${tripId}/members`, {
    method: 'POST',
    token,
    body,
  });
}

export function patchTripMemberRole(
  tripId: string,
  userId: string,
  tripRole: 'contributor' | 'follower',
  token: string,
): Promise<void> {
  return apiJson<void>(`/api/v1/trips/${tripId}/members/${userId}/role`, {
    method: 'PATCH',
    token,
    body: { tripRole },
  });
}

export function removeTripMember(tripId: string, userId: string, token: string): Promise<void> {
  return apiJson<void>(`/api/v1/trips/${tripId}/members/${userId}`, {
    method: 'DELETE',
    token,
  });
}

export function revokeTripMemberInvite(
  tripId: string,
  inviteId: string,
  token: string,
): Promise<void> {
  return apiJson<void>(`/api/v1/trips/${tripId}/members/invites/${inviteId}`, {
    method: 'DELETE',
    token,
  });
}

export function patchMyTripNotificationPreferences(
  tripId: string,
  body: UpdateTripMemberNotificationPreferencesRequest,
  token: string,
): Promise<Trip> {
  return apiJson<Trip>(`/api/v1/trips/${tripId}/members/me/notification-preferences`, {
    method: 'PATCH',
    token,
    body,
  });
}
