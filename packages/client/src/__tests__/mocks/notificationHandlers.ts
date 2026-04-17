import { http, HttpResponse } from 'msw';

import { VAPID_PUBLIC_KEY_PATH } from '../../api/notificationPaths.js';

/** Default: push is configured so clients can probe VAPID without failing tests. */
export const notificationHandlers = [
  http.get(VAPID_PUBLIC_KEY_PATH, () => HttpResponse.json({ publicKey: 'dGVzdC12YXBpZC1rZXk' })),
];
