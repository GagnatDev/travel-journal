import { http, HttpResponse } from 'msw';
import type { ListNotificationsResponse } from '@travel-journal/shared';

import { VAPID_PUBLIC_KEY_PATH } from '../../api/notificationPaths.js';

const emptyInbox: ListNotificationsResponse = { notifications: [], unreadCount: 0 };

/** Matches `/version.json` with optional query (cache-bust). */
const VERSION_JSON_PATH = /\/version\.json(\?.*)?$/;

/** Default: push is configured so clients can probe VAPID without failing tests. */
export const notificationHandlers = [
  http.get(VERSION_JSON_PATH, () =>
    HttpResponse.json({ buildId: 'vitest-client-bundle' }, { headers: { 'Cache-Control': 'no-store' } }),
  ),
  http.get(VAPID_PUBLIC_KEY_PATH, () => HttpResponse.json({ publicKey: 'dGVzdC12YXBpZC1rZXk' })),
  http.get('/api/v1/notifications', () => HttpResponse.json(emptyInbox)),
  http.post('/api/v1/notifications/read-all', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/v1/notifications/:id/read', () => new HttpResponse(null, { status: 204 })),
  http.delete('/api/v1/notifications/:id', () => new HttpResponse(null, { status: 204 })),
  http.delete('/api/v1/notifications', () => new HttpResponse(null, { status: 204 })),
];
