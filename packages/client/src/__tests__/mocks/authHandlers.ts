import { http, HttpResponse } from 'msw';
import type { PublicUser } from '@travel-journal/shared';

import { mockUser } from './fixtures.js';

export const authHandlers = [
  http.post('/api/v1/auth/refresh', () => {
    return HttpResponse.json({ accessToken: 'mock-token', user: mockUser });
  }),

  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.password === 'wrong') {
      return HttpResponse.json({ error: { message: 'Invalid credentials' } }, { status: 401 });
    }
    return HttpResponse.json({ accessToken: 'mock-token', user: mockUser });
  }),

  http.post('/api/v1/auth/logout', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/v1/auth/register', async ({ request }) => {
    const body = (await request.json()) as { email: string; displayName: string; password: string };
    const user: PublicUser = {
      id: 'admin-1',
      email: body.email,
      displayName: body.displayName,
      appRole: 'admin',
      preferredLocale: 'nb',
    };
    return HttpResponse.json({ accessToken: 'mock-admin-token', user }, { status: 201 });
  }),
];
