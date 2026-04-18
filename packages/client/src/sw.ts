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

self.addEventListener('push', (event) => {
  const payload = event.data?.json() as
    | { title?: string; body?: string; url?: string; type?: string }
    | undefined;
  const title = payload?.title ?? 'Travel Journal';
  const body = payload?.body ?? 'You have a new notification';
  const url = payload?.url ?? '/trips';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url, type: payload?.type },
      badge: '/icons/icon-192.png',
      icon: '/icons/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = String(event.notification.data?.url ?? '/trips');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const windowClient = client as WindowClient;
        if ('focus' in windowClient) {
          windowClient.postMessage({ type: 'notification-clicked', url });
          if (windowClient.url.includes(self.location.origin)) {
            return windowClient.focus();
          }
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
