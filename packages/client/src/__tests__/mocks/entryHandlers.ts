import { http, HttpResponse } from 'msw';
import type { Comment, Entry, Reaction } from '@travel-journal/shared';

export const entryHandlers = [
  http.get('/api/v1/trips/:id/entries/locations', () => HttpResponse.json([])),

  http.get('/api/v1/trips/:id/entries', () =>
    HttpResponse.json({ entries: [], total: 0 }),
  ),

  http.post('/api/v1/trips/:id/entries', async ({ request }) => {
    const body = (await request.json()) as {
      title: string;
      content: string;
      publicationStatus?: string;
    };
    const entry: Entry = {
      id: 'new-entry-1',
      tripId: 'trip-1',
      authorId: 'user-1',
      authorName: 'Test User',
      title: body.title,
      content: body.content,
      images: [],
      reactions: [],
      ...(body.publicationStatus === 'draft' ? { publicationStatus: 'draft' as const } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(entry, { status: 201 });
  }),

  http.get('/api/v1/trips/:id/entries/:entryId', ({ params }) => {
    const entryId = String(params['entryId']);
    const isDraft = entryId.includes('draft');
    return HttpResponse.json({
      id: params['entryId'],
      tripId: params['id'],
      authorId: 'user-1',
      authorName: 'Test User',
      title: 'Mock Entry',
      content: 'Mock content',
      images: [],
      reactions: [],
      ...(isDraft ? { publicationStatus: 'draft' as const } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }),

  http.patch('/api/v1/trips/:id/entries/:entryId', async ({ params, request }) => {
    const body = (await request.json()) as Partial<Entry> & { publicationStatus?: string };
    const entryId = String(params['entryId']);
    const wasDraft = entryId.includes('draft');
    const nowPublished = body.publicationStatus === 'published';
    return HttpResponse.json({
      id: params['entryId'],
      tripId: params['id'],
      authorId: 'user-1',
      authorName: 'Test User',
      title: body.title ?? 'Mock Entry',
      content: body.content ?? 'Mock content',
      images: [],
      reactions: [],
      ...(wasDraft && !nowPublished ? { publicationStatus: 'draft' as const } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }),

  http.delete('/api/v1/trips/:id/entries/:entryId', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  http.post('/api/v1/trips/:id/entries/:entryId/reactions', async ({ request }) => {
    const body = (await request.json()) as { emoji: string };
    const reaction: Reaction = {
      emoji: body.emoji as Reaction['emoji'],
      userId: 'user-1',
      createdAt: new Date().toISOString(),
    };
    return HttpResponse.json({ reactions: [reaction] });
  }),

  http.get('/api/v1/trips/:id/entries/:entryId/comments', () =>
    HttpResponse.json([] as Comment[]),
  ),

  http.post('/api/v1/trips/:id/entries/:entryId/comments', async ({ params, request }) => {
    const body = (await request.json()) as { content: string };
    const comment: Comment = {
      id: 'comment-1',
      entryId: String(params['entryId']),
      tripId: String(params['id']),
      authorId: 'user-1',
      authorName: 'Test User',
      content: body.content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(comment, { status: 201 });
  }),

  http.delete('/api/v1/trips/:id/entries/:entryId/comments/:commentId', () =>
    new HttpResponse(null, { status: 204 }),
  ),
];
