import type { PushSubscriptionInput } from '@travel-journal/shared';

import { apiJson } from './client.js';
import { VAPID_PUBLIC_KEY_PATH } from './notificationPaths.js';
export type PushServerAvailability = 'available' | 'unavailable' | 'error';
export { VAPID_PUBLIC_KEY_PATH } from './notificationPaths.js';

/**
 * Probes whether the server exposes Web Push (VAPID) for subscription flows.
 * Does not throw; maps failures to {@link PushServerAvailability}.
 */
export async function fetchPushServerAvailability(
  token: string,
  signal?: AbortSignal,
): Promise<PushServerAvailability> {
  const init: RequestInit = {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  };
  if (signal !== undefined) init.signal = signal;
  const res = await fetch(VAPID_PUBLIC_KEY_PATH, init);
  if (res.ok) return 'available';
  let code: string | undefined;
  try {
    const parsed = (await res.json()) as { error?: { code?: string } };
    code = parsed?.error?.code;
  } catch {
    /* ignore */
  }
  if (res.status === 503 && code === 'PUSH_UNAVAILABLE') return 'unavailable';
  return 'error';
}

export function fetchVapidPublicKey(token: string): Promise<{ publicKey: string }> {
  return apiJson<{ publicKey: string }>(VAPID_PUBLIC_KEY_PATH, { token });
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
