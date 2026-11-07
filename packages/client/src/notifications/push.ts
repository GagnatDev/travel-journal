import {
  deletePushSubscription,
  fetchVapidPublicKey,
  upsertPushSubscription,
} from '../api/notifications.js';

export type PushPermissionState = NotificationPermission | 'unsupported';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getPushPermissionState(): PushPermissionState {
  if (!isPushSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

function toUint8Array(base64String: string): Uint8Array {
  const padded = base64String.padEnd(base64String.length + ((4 - (base64String.length % 4)) % 4), '=');
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * True when `subscription` was created with `serverKey`. A subscription is bound to the
 * VAPID key it was made with; after the server's keypair changes (e.g. moving to the
 * Terraform-managed keys on the cluster) the push service rejects every send to it, so
 * it must be replaced. Unknown (browser doesn't expose the key) counts as a match.
 */
export function subscriptionMatchesServerKey(
  subscription: PushSubscription,
  serverKey: Uint8Array,
): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === serverKey.length && bytes.every((b, i) => b === serverKey[i]);
}

const SERVICE_WORKER_READY_TIMEOUT_MS = 5_000;

/**
 * Resolve the controlling service worker registration, but never hang forever.
 *
 * `navigator.serviceWorker.ready` only resolves once a registration has an
 * active worker. If no service worker is registered (e.g. a dev build without
 * the PWA plugin's `devOptions.enabled`), the promise never resolves, which
 * would silently stall any mutation that awaits it. Fail fast instead so the
 * UI can surface a meaningful error.
 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) {
    throw new Error('Service worker is not registered');
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Service worker did not become ready in time')),
      SERVICE_WORKER_READY_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function ensurePushSubscription(token: string): Promise<PushPermissionState> {
  if (!isPushSupported()) {
    return 'unsupported';
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return permission;
  }

  const [{ publicKey }, registration] = await Promise.all([
    fetchVapidPublicKey(token),
    getServiceWorkerRegistration(),
  ]);
  const serverKey = toUint8Array(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !subscriptionMatchesServerKey(subscription, serverKey)) {
    // Made under the previous VAPID keypair: replace it silently (permission is already
    // granted, so no prompt) and drop the dead endpoint server-side.
    const staleEndpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => false);
    await deletePushSubscription(token, staleEndpoint).catch(() => undefined);
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey as unknown as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.['p256dh'] || !json.keys?.['auth']) {
    throw new Error('Invalid push subscription payload');
  }

  await upsertPushSubscription(
    token,
    {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys['p256dh'],
        auth: json.keys['auth'],
      },
    },
    navigator.userAgent.slice(0, 200),
    publicKey,
  );

  return permission;
}

export async function syncPushSubscriptionIfPermitted(token: string): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  await ensurePushSubscription(token);
}
