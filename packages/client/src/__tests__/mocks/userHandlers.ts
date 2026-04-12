import { http, HttpResponse } from 'msw';
import type { PublicUser } from '@travel-journal/shared';

import { mockUser } from './fixtures.js';

export const userHandlers = [
  http.patch('/api/v1/users/me', async ({ request }) => {
    const body = (await request.json()) as Partial<Pick<PublicUser, 'displayName' | 'preferredLocale'>>;
    return HttpResponse.json({ ...mockUser, ...body });
  }),
];
