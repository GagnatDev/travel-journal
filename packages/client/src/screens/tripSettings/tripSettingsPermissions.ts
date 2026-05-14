import type { Trip, TripRole, TripStatus } from '@travel-journal/shared';

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

/** Invite people to the trip (add existing users or create email invites). */
export function canUseTripInviteActions(trip: Trip | undefined, role: TripRole | undefined): boolean {
  if (role === 'creator') return true;
  if (role === 'contributor' && trip?.allowContributorInvites === true) return true;
  return false;
}

export function canEditTripDetailsAndLifecycle(role: TripRole | undefined): boolean {
  return role === 'creator';
}

export function canDeleteTrip(role: TripRole | undefined): boolean {
  return role === 'creator';
}

/** Photobook PDF download (API also enforces trip creator + active/completed). */
export function canDownloadTripPhotobookPdf(role: TripRole | undefined, tripStatus: TripStatus): boolean {
  if (role !== 'creator') return false;
  return tripStatus === 'active' || tripStatus === 'completed';
}
