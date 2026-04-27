import { describe, it, expect, vi } from 'vitest';
import type { Entry, Trip } from '@travel-journal/shared';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

vi.mock('../services/media.service.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/media.service.js')>();
  return {
    ...mod,
    getObjectBuffer: vi.fn().mockResolvedValue(ONE_PX_PNG),
  };
});

describe('buildTripPhotobookPdf smoke', () => {
  it('produces a PDF buffer', async () => {
    const { buildTripPhotobookPdf } = await import('../services/trip-photobook-pdf.service.js');

    const trip: Trip = {
      id: 'trip1',
      name: 'Test Trip',
      description: 'A nice journey',
      departureDate: '2026-06-01T00:00:00.000Z',
      returnDate: '2026-06-10T00:00:00.000Z',
      status: 'active',
      createdBy: 'u1',
      members: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const entry: Entry = {
      id: 'e1',
      tripId: 'trip1',
      authorId: 'u1',
      authorName: 'A',
      title: 'Day one',
      content: 'We walked.',
      images: [
        {
          key: 'media/trip1/a.jpg',
          width: 100,
          height: 100,
          order: 0,
          uploadedAt: new Date().toISOString(),
        },
      ],
      reactions: [],
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
    };

    const buf = await buildTripPhotobookPdf({
      trip,
      entries: [entry],
      timeZone: 'UTC',
      photobookLocaleKey: 'en',
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
