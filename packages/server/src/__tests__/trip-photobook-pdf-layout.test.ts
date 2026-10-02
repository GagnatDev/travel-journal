import { describe, it, expect } from 'vitest';

import {
  computeJustifiedImageLayout,
  planPhotobookEntryPageCounts,
  splitPhotobookImagesAcrossPages,
  type PhotobookImageRect,
} from '../services/trip-photobook-pdf-layout.js';

const BAND = 100;
const GAP = 2;

function coverage(rects: PhotobookImageRect[]): number {
  return rects.reduce((a, r) => a + r.w * r.h, 0) / (BAND * BAND);
}

function expectInsideBand(rects: PhotobookImageRect[]): void {
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(-1e-6);
    expect(r.y).toBeGreaterThanOrEqual(-1e-6);
    expect(r.x + r.w).toBeLessThanOrEqual(BAND + 1e-6);
    expect(r.y + r.h).toBeLessThanOrEqual(BAND + 1e-6);
  }
}

function expectNoOverlap(rects: PhotobookImageRect[]): void {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(Math.min(overlapX, overlapY)).toBeLessThanOrEqual(1e-6);
    }
  }
}

describe('computeJustifiedImageLayout', () => {
  it('keeps a single image at its aspect ratio, filling the band width', () => {
    const rects = computeJustifiedImageLayout([{ iw: 400, ih: 300 }], BAND, BAND, GAP);
    expect(rects).toHaveLength(1);
    const r = rects[0]!;
    expect(r.w).toBeCloseTo(BAND, 5);
    expect(r.h).toBeCloseTo(75, 5);
    expect(r.w / r.h).toBeCloseTo(4 / 3, 5);
    // Centered vertically.
    expect(r.y).toBeCloseTo((BAND - 75) / 2, 5);
  });

  it('stacks two landscape images into rows rather than side by side', () => {
    const rects = computeJustifiedImageLayout(
      [
        { iw: 400, ih: 300 },
        { iw: 400, ih: 300 },
      ],
      BAND,
      BAND,
      GAP,
    );
    expect(rects).toHaveLength(2);
    expect(rects[0]!.x).toBeCloseTo(rects[1]!.x, 5);
    expect(rects[1]!.y).toBeGreaterThan(rects[0]!.y);
    expectInsideBand(rects);
    expectNoOverlap(rects);
  });

  it('places two portrait images side by side, filling the band width', () => {
    const rects = computeJustifiedImageLayout(
      [
        { iw: 300, ih: 400 },
        { iw: 300, ih: 400 },
      ],
      BAND,
      BAND,
      GAP,
    );
    expect(rects).toHaveLength(2);
    expect(rects[0]!.y).toBeCloseTo(rects[1]!.y, 5);
    expect(rects[1]!.x).toBeGreaterThan(rects[0]!.x);
    expect(rects[0]!.w + GAP + rects[1]!.w).toBeCloseTo(BAND, 5);
  });

  it('covers more of the band than a uniform 2x2 grid for a mixed set of four', () => {
    const sizes = [
      { iw: 400, ih: 300 },
      { iw: 300, ih: 400 },
      { iw: 400, ih: 300 },
      { iw: 400, ih: 300 },
    ];
    const rects = computeJustifiedImageLayout(sizes, BAND, BAND, GAP);
    expect(rects).toHaveLength(4);
    expectInsideBand(rects);
    expectNoOverlap(rects);
    // A 2x2 grid of aspect-fit cells covers at most ~72% for this mix.
    expect(coverage(rects)).toBeGreaterThan(0.75);
  });

  it('preserves every image aspect ratio', () => {
    const sizes = [
      { iw: 640, ih: 480 },
      { iw: 1080, ih: 1920 },
      { iw: 1000, ih: 1000 },
    ];
    const rects = computeJustifiedImageLayout(sizes, BAND, BAND, GAP);
    rects.forEach((r, i) => {
      expect(r.w / r.h).toBeCloseTo(sizes[i]!.iw / sizes[i]!.ih, 4);
    });
    expectInsideBand(rects);
    expectNoOverlap(rects);
  });

  it('returns an empty layout for no images', () => {
    expect(computeJustifiedImageLayout([], BAND, BAND, GAP)).toEqual([]);
  });
});

describe('planPhotobookEntryPageCounts', () => {
  const opts = { minPages: 24, maxImagesPerPage: 4 };

  it('keeps the baseline when the trip already reaches the minimum', () => {
    const counts = Array.from({ length: 30 }, () => 2);
    expect(planPhotobookEntryPageCounts(counts, opts)).toEqual(counts.map(() => 1));
  });

  it('spreads a small trip up to one image per page', () => {
    // One entry, six images: baseline 2 pages, spread to 6 (cannot split further).
    expect(planPhotobookEntryPageCounts([6], opts)).toEqual([6]);
  });

  it('never plans past the product minimum', () => {
    // 12 entries x 4 images: baseline 12 pages, spread evenly to exactly 24.
    const counts = Array.from({ length: 12 }, () => 4);
    const pages = planPhotobookEntryPageCounts(counts, opts);
    expect(pages.reduce((a, b) => a + b, 0)).toBe(24);
    expect(pages).toEqual(counts.map(() => 2));
  });

  it('spreads the densest entries first', () => {
    const pages = planPhotobookEntryPageCounts([16, 2], opts);
    expect(pages.reduce((a, b) => a + b, 0)).toBe(18); // 16 + 2, fully spread
    expect(pages).toEqual([16, 2]);
  });

  it('gives image-less entries one page and never splits them', () => {
    expect(planPhotobookEntryPageCounts([0, 10], opts)).toEqual([1, 10]);
  });
});

describe('splitPhotobookImagesAcrossPages', () => {
  it('splits chronologically into near-equal pages', () => {
    expect(splitPhotobookImagesAcrossPages([1, 2, 3, 4, 5], 3)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('keeps everything on one page when asked', () => {
    expect(splitPhotobookImagesAcrossPages([1, 2, 3], 1)).toEqual([[1, 2, 3]]);
  });

  it('returns a single empty page for image-less entries', () => {
    expect(splitPhotobookImagesAcrossPages([], 1)).toEqual([[]]);
  });

  it('never produces empty pages even if asked for more pages than images', () => {
    expect(splitPhotobookImagesAcrossPages([1, 2], 5)).toEqual([[1], [2]]);
  });
});
