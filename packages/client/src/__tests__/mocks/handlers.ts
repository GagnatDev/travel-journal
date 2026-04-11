import { http, HttpResponse } from 'msw';
import type { Invite, PublicUser, Trip } from '@travel-journal/shared';

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

const mockTrip: Trip = {
  id: 'trip-1',
  name: 'Mock Trip',
  status: 'planned',
  createdBy: 'user-1',
  members: [
    { userId: 'user-1', displayName: 'Test User', tripRole: 'creator', addedAt: new Date().toISOString() },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockInvite: Invite = {
  id: 'invite-1',
  type: 'platform',
  email: 'pending@example.com',
  assignedAppRole: 'follower',
  status: 'pending',
  invitedBy: 'admin-1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
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

  http.get('/api/v1/trips', () => HttpResponse.json([])),

  http.post('/api/v1/trips', async ({ request }) => {
    const body = (await request.json()) as { name: string };
    return HttpResponse.json(
      {
        id: 'new-trip-1',
        name: body.name,
        status: 'planned',
        createdBy: 'user-1',
        members: [{ userId: 'user-1', displayName: 'Test User', tripRole: 'creator', addedAt: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  http.get('/api/v1/trips/:id', ({ params }) => {
    return HttpResponse.json({ ...mockTrip, id: params['id'] });
  }),

  http.patch('/api/v1/trips/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, string>;
    return HttpResponse.json({
      ...mockTrip,
      id: params['id'],
      name: body['name'] ?? 'Mock Trip',
    });
  }),

  http.patch('/api/v1/trips/:id/status', async ({ params, request }) => {
    const body = (await request.json()) as { status: string };
    return HttpResponse.json({ ...mockTrip, id: params['id'], status: body.status });
  }),

  http.delete('/api/v1/trips/:id', () => new HttpResponse(null, { status: 204 })),

  // Member management
  http.get('/api/v1/trips/:id/members/invites', () => HttpResponse.json([])),

  http.post('/api/v1/trips/:id/members', async ({ request }) => {
    const body = (await request.json()) as { emailOrNickname: string };
    if (body.emailOrNickname === 'unknown@example.com') {
      return HttpResponse.json({ type: 'invite_created', inviteLink: '/invite/accept?token=mock-token-123' });
    }
    return HttpResponse.json({ type: 'added' });
  }),

  http.patch('/api/v1/trips/:id/members/:userId/role', () =>
    HttpResponse.json({ success: true }),
  ),

  http.delete('/api/v1/trips/:id/members/:userId', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  http.delete('/api/v1/trips/:id/members/invites/:inviteId', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // Invites
  http.get('/api/v1/invites/:token/validate', ({ params }) => {
    if (params['token'] === 'expired-token') {
      return HttpResponse.json({ error: { message: 'Gone' } }, { status: 410 });
    }
    return HttpResponse.json({ email: 'invited@example.com', type: 'platform', assignedAppRole: 'creator' });
  }),

  http.post('/api/v1/invites/accept', async ({ request }) => {
    const body = (await request.json()) as { token: string };
    if (body.token === 'expired-token') {
      return HttpResponse.json({ error: { message: 'Gone' } }, { status: 410 });
    }
    return HttpResponse.json(
      { accessToken: 'new-token', user: { ...mockUser, email: 'invited@example.com' } },
      { status: 201 },
    );
  }),

  http.post('/api/v1/invites/platform', async ({ request }) => {
    const body = (await request.json()) as { email: string; assignedAppRole: string };
    return HttpResponse.json(
      {
        invite: { ...mockInvite, email: body.email, assignedAppRole: body.assignedAppRole },
        inviteLink: '/invite/accept?token=new-mock-token',
      },
      { status: 201 },
    );
  }),

  http.get('/api/v1/invites/platform', () => HttpResponse.json([mockInvite])),

  http.delete('/api/v1/invites/platform/:id', () => new HttpResponse(null, { status: 204 })),

  // Users
  http.get('/api/v1/users', () =>
    HttpResponse.json([
      mockAdminUser,
      mockUser,
      { ...mockUser, id: 'follower-1', email: 'follower@example.com', displayName: 'Follower User', appRole: 'follower' },
    ]),
  ),

  http.patch('/api/v1/users/:id/promote', ({ params }) =>
    HttpResponse.json({
      id: params['id'],
      email: 'follower@example.com',
      displayName: 'Follower User',
      appRole: 'creator',
      preferredLocale: 'nb',
    }),
  ),

  http.patch('/api/v1/users/me', async ({ request }) => {
    const body = (await request.json()) as Partial<PublicUser>;
    return HttpResponse.json({ ...mockUser, ...body });
  }),
];
