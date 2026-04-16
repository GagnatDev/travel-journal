import type { PushSubscriptionInput } from '@travel-journal/shared';

import { apiJson } from './client.js';

export function fetchVapidPublicKey(token: string): Promise<{ publicKey: string }> {
  return apiJson<{ publicKey: string }>('/api/v1/notifications/vapid-public-key', { token });
}

export function upsertPushSubscription(
  token: string,
  subscription: PushSubscriptionInput,
  deviceLabel?: string,
): Promise<{ success: true }> {
  return apiJson<{ success: true }>('/api/v1/notifications/subscriptions', {
    method: 'POST',
    token,
    body: { subscription, deviceLabel },
  });
}

export function deletePushSubscription(token: string, endpoint: string): Promise<void> {
  return apiJson<void>('/api/v1/notifications/subscriptions', {
    method: 'DELETE',
    token,
    body: { endpoint },
  });
}
