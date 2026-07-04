import type { PublicUser } from '@travel-journal/shared';

export type AdminPanelTab = 'users' | 'invites' | 'orders';

export interface AdminUser extends PublicUser {
  createdAt?: string;
}
