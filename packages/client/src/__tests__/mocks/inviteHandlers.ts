import { http, HttpResponse } from 'msw';

import { mockUser } from './fixtures.js';

export const inviteHandlers = [
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
];
