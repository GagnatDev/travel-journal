import type { Invite, PublicUser, Trip } from '@travel-journal/shared';

export const mockUser: PublicUser = {
  id: 'user-1',
  email: 'test@example.com',
  displayName: 'Test User',
  appRole: 'creator',
  preferredLocale: 'nb',
};

export const mockAdminUser: PublicUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Admin User',
  appRole: 'admin',
  preferredLocale: 'nb',
};

export const mockTrip: Trip = {
  id: 'trip-1',
  name: 'Mock Trip',
  status: 'planned',
  createdBy: 'user-1',
  allowContributorInvites: false,
  members: [
    {
      userId: 'user-1',
      displayName: 'Test User',
      tripRole: 'creator',
      addedAt: new Date().toISOString(),
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockInvite: Invite = {
  id: 'invite-1',
  type: 'platform',
  email: 'pending@example.com',
  assignedAppRole: 'follower',
  status: 'pending',
  invitedBy: 'admin-1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
};
