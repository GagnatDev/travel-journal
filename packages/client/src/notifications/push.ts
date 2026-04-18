import { fetchVapidPublicKey, upsertPushSubscription } from '../api/notifications.js';

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
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8Array(publicKey) as unknown as BufferSource,
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
  );

  return permission;
}

export async function syncPushSubscriptionIfPermitted(token: string): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  await ensurePushSubscription(token);
}
