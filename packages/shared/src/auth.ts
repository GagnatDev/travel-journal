import type { ShippingAddress } from './photobookOrders.js';

export type AppRole = 'admin' | 'creator' | 'follower';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  appRole: AppRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: PublicUser;
}

export interface RegisterRequest {
  email: string;
  displayName: string;
  password: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  appRole: AppRole;
  preferredLocale: 'nb' | 'en';
  /** Admin-controlled gate: whether this user may order a physical photobook. */
  photobookOrderingEnabled?: boolean;
  /** Saved shipping address, prefilled into the order form and updated from it. */
  shippingAddress?: ShippingAddress;
  avatarKey?: string;
  createdAt?: string;
}
