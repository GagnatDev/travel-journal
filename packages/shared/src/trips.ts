export type TripStatus = 'planned' | 'active' | 'completed';
export type TripRole = 'creator' | 'contributor' | 'follower';

/** Async photobook PDF generation state for the trip creator (server-managed). */
export type TripPhotobookPdfJobStatus = 'idle' | 'pending' | 'ready' | 'failed';

export interface TripPhotobookPdfJob {
  status: TripPhotobookPdfJobStatus;
  /** When status is `ready`, storage key for the generated PDF (creator-only download URL uses this). */
  pdfStorageKey?: string;
  /** ISO time when generation finished successfully or failed. */
  finishedAt?: string;
  /** When status is `failed`, short message suitable for display (locale-neutral English fallback server-side). */
  errorMessage?: string;
}

/**
 * How a trip member wants to hear about new entries in the trip.
 *
 * - `off`: no inbox row, no push.
 * - `per_entry`: one inbox row + one push per new entry (immediate).
 * - `daily_digest`: a single summary inbox row + one push per day, in the evening, only if at least one new entry was created since the previous digest window. No per-entry rows.
 */
export type TripEntryNotificationMode = 'off' | 'per_entry' | 'daily_digest';

export interface TripMemberNotificationPreferences {
  newEntriesMode: TripEntryNotificationMode;
}

export interface TripMember {
  userId: string;
  displayName: string;
  tripRole: TripRole;
  addedAt: string; // ISO date
  notificationPreferences?: TripMemberNotificationPreferences;
}

export interface Trip {
  id: string;
  name: string;
  description?: string;
  departureDate?: string;
  returnDate?: string;
  status: TripStatus;
  createdBy: string;
  /**
   * When set, the photobook PDF cover uses this entry image (storage key) instead of a random trip photo.
   * Only the trip creator may change it; the key must belong to an image on a non-deleted entry in this trip.
   */
  photobookCoverImageKey?: string;
  /** Latest async photobook PDF generation status (trip creator only meaningful). */
  photobookPdfJob?: TripPhotobookPdfJob;
  /** When true, trip contributors may invite people to this trip (same flows as the creator). */
  allowContributorInvites: boolean;
  members: TripMember[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripRequest {
  name: string;
  description?: string;
  departureDate?: string;
  returnDate?: string;
}

export interface UpdateTripRequest {
  name?: string;
  description?: string;
  departureDate?: string;
  returnDate?: string;
  allowContributorInvites?: boolean;
  /** Set to a full image storage key, or `null` to clear and use random cover again. */
  photobookCoverImageKey?: string | null;
}

export interface UpdateTripMemberNotificationPreferencesRequest {
  newEntriesMode: TripEntryNotificationMode;
}

/** Users the trip creator may pick when inviting someone to this trip (from related trips). */
export interface TripMemberInviteSuggestion {
  userId: string;
  displayName: string;
  email: string;
}
