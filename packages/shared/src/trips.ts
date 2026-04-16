export type TripStatus = 'planned' | 'active' | 'completed';
export type TripRole = 'creator' | 'contributor' | 'follower';

export interface TripMemberNotificationPreferences {
  newEntriesPushEnabled: boolean;
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
}

export interface UpdateTripMemberNotificationPreferencesRequest {
  newEntriesPushEnabled: boolean;
}
