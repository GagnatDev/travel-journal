import { http, HttpResponse } from 'msw';

import { mockAdminUser, mockInvite, mockUser } from './fixtures.js';

export const adminHandlers = [
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

  http.get('/api/v1/users', () =>
    HttpResponse.json([
      mockAdminUser,
      mockUser,
      {
        ...mockUser,
        id: 'follower-1',
        email: 'follower@example.com',
        displayName: 'Follower User',
        appRole: 'follower',
      },
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

  http.post('/api/v1/users/:id/password-reset-link', ({ params }) =>
    HttpResponse.json(
      { resetLink: `/password-reset?token=mock-reset-${params['id']}` },
      { status: 201 },
    ),
  ),

  http.patch('/api/v1/users/me', async ({ request }) => {
    const body = (await request.json()) as Partial<typeof mockUser>;
    return HttpResponse.json({ ...mockUser, ...body });
  }),
];
