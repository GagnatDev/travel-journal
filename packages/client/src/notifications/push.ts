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

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
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
