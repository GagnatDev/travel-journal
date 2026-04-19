/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/trips'),
  new NetworkFirst({ cacheName: 'api-trips' }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/media/'),
  new StaleWhileRevalidate({ cacheName: 'media' }),
);

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  type?: string;
  data?: unknown;
  notificationId?: string;
}

self.addEventListener('push', (event) => {
  const payload = event.data?.json() as PushPayload | undefined;
  const title = payload?.title ?? 'Reisedagbok';
  const body = payload?.body ?? 'Du har et nytt varsel';
  const url = payload?.url ?? '/trips';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: {
        url,
        type: payload?.type,
        notificationId: payload?.notificationId,
        payload: payload?.data,
      },
      badge: '/icons/icon-192.png',
      icon: '/icons/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as
    | { url?: string; notificationId?: string }
    | undefined;
  const url = String(data?.url ?? '/trips');
  const notificationId = data?.notificationId;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const windowClient = client as WindowClient;
        if ('focus' in windowClient) {
          windowClient.postMessage({ type: 'notification-clicked', url, notificationId });
          if (windowClient.url.includes(self.location.origin)) {
            return windowClient.focus();
          }
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
