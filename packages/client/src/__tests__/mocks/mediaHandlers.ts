import { http, HttpResponse } from 'msw';

export const mediaHandlers = [
  http.get(/\/api\/v1\/media\/.+/, () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    return new HttpResponse(png, { headers: { 'Content-Type': 'image/png' } });
  }),

  http.post('/api/v1/media/upload', async () => {
    return HttpResponse.json(
      { key: 'media/trip-1/mock-uuid.jpg', url: '/api/v1/media/media/trip-1/mock-uuid.jpg' },
      { status: 201 },
    );
  }),
];
