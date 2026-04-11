import { http, HttpResponse } from 'msw';
import type { PublicUser } from '@travel-journal/shared';

export const mockUser: PublicUser = {
  id: 'user-1',
  email: 'test@example.com',
  displayName: 'Test User',
  appRole: 'creator',
  preferredLocale: 'nb',
};

export const mockAdminUser: PublicUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Admin User',
  appRole: 'admin',
  preferredLocale: 'nb',
};

export const handlers = [
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

  http.get('/api/v1/auth/register', () => {
    return HttpResponse.json({ adminExists: false });
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
