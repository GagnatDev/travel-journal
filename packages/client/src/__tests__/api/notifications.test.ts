import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';

import { fetchPushServerAvailability, VAPID_PUBLIC_KEY_PATH } from '../../api/notifications.js';
import { server } from '../mocks/server.js';

describe('fetchPushServerAvailability', () => {
  it("returns 'available' when the server returns a public key", async () => {
    server.use(
      http.get(VAPID_PUBLIC_KEY_PATH, () => HttpResponse.json({ publicKey: 'dGVzdA==' })),
    );
    await expect(fetchPushServerAvailability('token')).resolves.toBe('available');
  });

  it("returns 'unavailable' for 503 with PUSH_UNAVAILABLE", async () => {
    server.use(
      http.get(VAPID_PUBLIC_KEY_PATH, () =>
        HttpResponse.json(
          { error: { message: 'Push notifications are unavailable', code: 'PUSH_UNAVAILABLE' } },
          { status: 503 },
        ),
      ),
    );
    await expect(fetchPushServerAvailability('token')).resolves.toBe('unavailable');
  });

  it("returns 'error' for other non-OK responses", async () => {
    server.use(http.get(VAPID_PUBLIC_KEY_PATH, () => new HttpResponse(null, { status: 502 })));
    await expect(fetchPushServerAvailability('token')).resolves.toBe('error');
  });
});
