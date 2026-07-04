import { parseISO } from 'date-fns';
import type { Trip } from '@travel-journal/shared';

export const TRIP_INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Active or planned trips count as inactive when their newest entry is more
 * than a week old. Trips without entries fall back to the trip's own
 * `updatedAt`, so a freshly created or activated trip gets a week before it
 * is tucked away.
 */
export function isTripInactive(trip: Trip, now: number = Date.now()): boolean {
  if (trip.status !== 'active' && trip.status !== 'planned') return false;
  const lastActivity = trip.lastEntryAt ?? trip.updatedAt;
  return now - parseISO(lastActivity).getTime() > TRIP_INACTIVITY_THRESHOLD_MS;
}
