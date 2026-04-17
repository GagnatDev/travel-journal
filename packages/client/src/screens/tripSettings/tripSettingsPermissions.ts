import type { Trip, TripRole } from '@travel-journal/shared';

/** Trip role for the signed-in user when `trip` and `userId` are known. */
export function viewerTripRoleForUser(trip: Trip | undefined, userId: string | undefined): TripRole | undefined {
  if (!trip || !userId) return undefined;
  return trip.members.find((m) => m.userId === userId)?.tripRole;
}

/** Whether this route may show trip settings (timeline nav exposes it for creators and contributors). */
export function canAccessTripSettingsScreen(role: TripRole | undefined): boolean {
  return role === 'creator' || role === 'contributor';
}

export function canManageTripInvitesAndMembers(role: TripRole | undefined): boolean {
  return role === 'creator';
}

export function canEditTripDetailsAndLifecycle(role: TripRole | undefined): boolean {
  return role === 'creator';
}

export function canDeleteTrip(role: TripRole | undefined): boolean {
  return role === 'creator';
}
