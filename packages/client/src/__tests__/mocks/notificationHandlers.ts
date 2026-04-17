import { http, HttpResponse } from 'msw';

/** Default: push is configured so clients can probe VAPID without failing tests. */
export const notificationHandlers = [
  http.get('/api/v1/notifications/vapid-public-key', () =>
    HttpResponse.json({ publicKey: 'dGVzdC12YXBpZC1rZXk' }),
  ),
];
