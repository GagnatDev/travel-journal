import { http, HttpResponse } from 'msw';

import { mockTrip } from './fixtures.js';

export const tripHandlers = [
  http.get('/api/v1/trips', () => HttpResponse.json([])),

  http.post('/api/v1/trips', async ({ request }) => {
    const body = (await request.json()) as { name: string };
    return HttpResponse.json(
      {
        id: 'new-trip-1',
        name: body.name,
        status: 'planned',
        createdBy: 'user-1',
        members: [
          {
            userId: 'user-1',
            displayName: 'Test User',
            tripRole: 'creator',
            addedAt: new Date().toISOString(),
          },
        ],
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
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...mockTrip,
      id: params['id'],
      name: typeof body['name'] === 'string' ? body['name'] : 'Mock Trip',
      ...(typeof body['description'] === 'string' ? { description: body['description'] } : {}),
    });
  }),

  http.patch('/api/v1/trips/:id/status', async ({ params, request }) => {
    const body = (await request.json()) as { status: string };
    return HttpResponse.json({ ...mockTrip, id: params['id'], status: body.status });
  }),

  http.delete('/api/v1/trips/:id', () => new HttpResponse(null, { status: 204 })),

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
];
