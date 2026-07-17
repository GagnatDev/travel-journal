/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

import { isAuthPath } from './auth/authPaths.js';
import { cacheableApiResponse } from './pwa/swCachePolicy.js';

declare let self: ServiceWorkerGlobalScope;

// Auth traffic must always reach the network, and its responses must never be
// cached. This covers today's hand-rolled endpoints (/api/v1/auth/*) and the
// paths the homectl-auth forward-auth sidecar will own after migration
// (/auth/callback, /auth/logout, /auth/login). If the OAuth callback or a
// refresh were ever answered from a cache, the session would never be
// (re-)established while the app shell keeps loading from the precache — the
// installed PWA would be stuck in an auth loop with no way to recover short of
// clearing site data. Registered before all other routes so nothing can shadow it.
//
// IMPORTANT: for the same reason, never add a navigation fallback
// (NavigationRoute / navigateFallback) that serves index.html for auth paths.
// A top-level navigation with an expired session is exactly how interactive
// re-login happens under the sidecar; it must pass through to the network.
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && isAuthPath(url.pathname),
  new NetworkOnly(),
);

precacheAndRoute(self.__WB_MANIFEST);

// With `registerType: 'prompt'` a freshly installed worker stays in the
// "waiting" state until the page tells it to activate. The PWA UI surfaces an
// "Update now" action which calls `updateSW(true)`, posting this message — only
// then do we skip waiting and take over, so the user is never interrupted.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// Only cache clean, non-redirected 200s (see swCachePolicy.ts) so a login
// page or opaque redirect served by an auth proxy can never be stored as
// trips JSON or media bytes.
const onlyCleanApiResponses = {
  cacheWillUpdate: ({ response }: { response: Response }) =>
    Promise.resolve(cacheableApiResponse(response)),
};

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/trips'),
  new NetworkFirst({ cacheName: 'api-trips', plugins: [onlyCleanApiResponses] }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/media/'),
  new StaleWhileRevalidate({ cacheName: 'media', plugins: [onlyCleanApiResponses] }),
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
