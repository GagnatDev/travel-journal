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
        allowContributorInvites: false,
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

  http.post('/api/v1/trips/:id/photobook/generate', async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as { locale?: string; timeZone?: string };
    return HttpResponse.json(
      {
        ...mockTrip,
        id: params['id'],
        status: 'active',
        photobookPdfJob: {
          status: 'pending',
          localeKey: body.locale,
          timeZone: body.timeZone,
        },
      },
      { status: 202 },
    );
  }),

  /** Minimal PDF bytes for photobook download tests */
  http.get('/api/v1/trips/:id/photobook.pdf', () => {
    const pdf = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x31,
      0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f,
      0x62, 0x6a, 0x0a, 0x74, 0x72, 0x61, 0x69, 0x6c, 0x65, 0x72, 0x0a, 0x3c, 0x3c, 0x3e, 0x3e, 0x0a,
      0x25, 0x25, 0x45, 0x4f, 0x46,
    ]);
    return new HttpResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="mock-photobook.pdf"',
      },
    });
  }),

  http.patch('/api/v1/trips/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const next: Record<string, unknown> = {
      ...mockTrip,
      id: params['id'],
      name: typeof body['name'] === 'string' ? body['name'] : 'Mock Trip',
      ...(typeof body['description'] === 'string' ? { description: body['description'] } : {}),
      ...(typeof body['allowContributorInvites'] === 'boolean'
        ? { allowContributorInvites: body['allowContributorInvites'] }
        : {}),
    };
    if ('photobookCoverImageKey' in body) {
      if (body['photobookCoverImageKey'] === null || body['photobookCoverImageKey'] === '') {
        delete next['photobookCoverImageKey'];
      } else if (typeof body['photobookCoverImageKey'] === 'string') {
        next['photobookCoverImageKey'] = body['photobookCoverImageKey'];
      }
    }
    return HttpResponse.json(next);
  }),

  http.patch('/api/v1/trips/:id/status', async ({ params, request }) => {
    const body = (await request.json()) as { status: string };
    return HttpResponse.json({ ...mockTrip, id: params['id'], status: body.status });
  }),

  http.delete('/api/v1/trips/:id', () => new HttpResponse(null, { status: 204 })),

  http.get('/api/v1/trips/:id/members/invites', () => HttpResponse.json([])),

  http.get('/api/v1/trips/:id/members/invites/suggestions', () => HttpResponse.json([])),

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
