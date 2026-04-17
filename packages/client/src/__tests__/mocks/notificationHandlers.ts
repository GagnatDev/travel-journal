import { http, HttpResponse } from 'msw';

/** Matches any origin (CI/jsdom may resolve a different host than localhost). */
export const vapidPublicKeyPath = /\/api\/v1\/notifications\/vapid-public-key$/;

/** Default: push is configured so clients can probe VAPID without failing tests. */
export const notificationHandlers = [
  http.get(vapidPublicKeyPath, () => HttpResponse.json({ publicKey: 'dGVzdC12YXBpZC1rZXk' })),
];
