import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Entry } from '@travel-journal/shared';

describe('trip-photobook-map-static', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['TRIP_PDF_MAPBOX_TOKEN'];
    delete process.env['MAPBOX_ACCESS_TOKEN'];
    delete process.env['TRIP_PDF_IMAGE_DPR'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collectPhotobookEntryLocations keeps valid coords and drops invalid', async () => {
    const {
      collectPhotobookEntryLocations,
    } = await import('../services/trip-photobook-map-static.js');
    const base: Omit<Entry, 'location'> = {
      id: 'e1',
      tripId: 't1',
      authorId: 'u1',
      authorName: 'A',
      title: 'T',
      content: '',
      images: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const entries: Entry[] = [
      { ...base, id: 'a', location: { lat: 59.9, lng: 10.7 } },
      { ...base, id: 'b', location: { lat: NaN, lng: 10 } } as Entry,
      { ...base, id: 'c' },
      { ...base, id: 'd', location: { lat: 200, lng: 0 } } as Entry,
    ];
    expect(collectPhotobookEntryLocations(entries)).toEqual([{ lat: 59.9, lng: 10.7 }]);
  });

  it('getPhotobookPdfMapboxToken prefers TRIP_PDF_MAPBOX_TOKEN', async () => {
    process.env['MAPBOX_ACCESS_TOKEN'] = '  pk.from.mapbox  ';
    process.env['TRIP_PDF_MAPBOX_TOKEN'] = ' pk.from.trip ';
    const { getPhotobookPdfMapboxToken } = await import('../services/trip-photobook-map-static.js');
    expect(getPhotobookPdfMapboxToken()).toBe('pk.from.trip');
  });

  it('getPhotobookPdfMapboxToken falls back to MAPBOX_ACCESS_TOKEN', async () => {
    process.env['MAPBOX_ACCESS_TOKEN'] = 'pk.fallback';
    const { getPhotobookPdfMapboxToken } = await import('../services/trip-photobook-map-static.js');
    expect(getPhotobookPdfMapboxToken()).toBe('pk.fallback');
  });

  it('buildMapboxStaticImageUrl uses outdoors-v12, bbox path, padding, and token', async () => {
    const { buildMapboxStaticImageUrl } = await import('../services/trip-photobook-map-static.js');
    const url = buildMapboxStaticImageUrl({
      accessToken: 'tk.test',
      widthPx: 400,
      heightPx: 300,
      bbox: { west: 10, south: 59, east: 11, north: 60 },
      markerOverlay: 'pin-s+9b3f2b(10.5,59.5)',
      retina: false,
    });
    expect(url).toContain('mapbox/outdoors-v12');
    expect(url).toContain('pin-s+9b3f2b(10.5,59.5)/[10,59,11,60]/400x300');
    expect(url).toContain('padding=60');
    expect(url).toContain('attribution=false');
    expect(url).toContain('logo=false');
    expect(url).toContain('access_token=tk.test');
  });

  it('expandBoundsToMaxZoom reduces implied zoom for a tight bbox', async () => {
    const { zoomLevelFromBounds, expandBoundsToMaxZoom } = await import('../services/trip-photobook-map-static.js');
    const tight = { west: 10.5, south: 59.5, east: 10.5001, north: 59.5001 };
    const before = zoomLevelFromBounds(tight, 800, 800);
    expect(before).toBeGreaterThan(12);
    const expanded = expandBoundsToMaxZoom(tight, 800, 800, 12);
    expect(zoomLevelFromBounds(expanded, 800, 800)).toBeLessThanOrEqual(12.0001);
  });

  it('photobookMapStaticRequestPixels caps at 1280 and respects TRIP_PDF_IMAGE_DPR', async () => {
    process.env['TRIP_PDF_IMAGE_DPR'] = '10';
    const { photobookMapStaticRequestPixels } = await import('../services/trip-photobook-map-static.js');
    const { widthPx, heightPx } = photobookMapStaticRequestPixels(500, 400);
    expect(widthPx).toBe(1280);
    expect(heightPx).toBe(1280);
  });

  it('fetchPhotobookMapStaticPng returns null on non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchPhotobookMapStaticPng } = await import('../services/trip-photobook-map-static.js');
    const buf = await fetchPhotobookMapStaticPng({
      points: [{ lat: 59, lng: 10 }],
      widthPx: 200,
      heightPx: 200,
      accessToken: 'x',
    });
    expect(buf).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetchPhotobookMapStaticPng returns buffer on success', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      }),
    );
    const { fetchPhotobookMapStaticPng } = await import('../services/trip-photobook-map-static.js');
    const buf = await fetchPhotobookMapStaticPng({
      points: [
        { lat: 59.9, lng: 10.7 },
        { lat: 60, lng: 10.8 },
      ],
      widthPx: 200,
      heightPx: 200,
      accessToken: 'x',
    });
    expect(buf).not.toBeNull();
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});
