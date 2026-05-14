export type InviteType = 'platform' | 'trip';
export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export interface Invite {
  id: string;
  type: InviteType;
  email: string;
  assignedAppRole: 'creator' | 'follower';
  tripId?: string;
  tripRole?: 'contributor' | 'follower';
  status: InviteStatus;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
  /** Present when the server can reconstruct the invite URL (pending, not expired). */
  inviteLink?: string;
}

export interface PlatformInviteRequest {
  email: string;
  assignedAppRole: 'creator' | 'follower';
}

export interface TripInviteRequest {
  emailOrNickname: string;
  tripRole: 'contributor' | 'follower';
}

export interface AcceptInviteRequest {
  token: string;
  displayName: string;
  password: string;
}
