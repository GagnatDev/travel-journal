/**
 * Pure layout planning for the trip photobook PDF: justified image layouts that
 * maximise page coverage, and page-count planning that spreads a small trip's
 * images across the product's minimum page count instead of blank padding pages.
 */

export interface PhotobookImageSize {
  iw: number;
  ih: number;
}

/** Placement relative to the top-left corner of the image band. */
export interface PhotobookImageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Guard against missing/degenerate metadata producing unusable aspect ratios. */
function safeAspectRatio(size: PhotobookImageSize): number {
  const r = Math.max(1, size.iw) / Math.max(1, size.ih);
  return Math.min(20, Math.max(0.05, r));
}

/** Ordered compositions of n into rows, e.g. 3 → [3], [1,2], [2,1], [1,1,1]. */
function rowCompositions(n: number): number[][] {
  if (n <= 0) return [];
  if (n === 1) return [[1]];
  const out: number[][] = [[n]];
  for (let first = 1; first < n; first++) {
    for (const rest of rowCompositions(n - first)) out.push([first, ...rest]);
  }
  return out;
}

/**
 * Lay images out as justified rows: within a row every image shares the row
 * height and keeps its exact aspect ratio, so the row fills the band width
 * with no slack beyond the fixed gaps. Every way of splitting the images
 * (in order) into rows is tried and the one covering the most band area wins;
 * layouts taller than the band are scaled down uniformly (gaps included) and
 * the final block is centered.
 */
export function computeJustifiedImageLayout(
  sizes: PhotobookImageSize[],
  bandW: number,
  bandH: number,
  gap: number,
): PhotobookImageRect[] {
  if (sizes.length === 0 || bandW <= 0 || bandH <= 0) return [];
  const ratios = sizes.map(safeAspectRatio);

  interface Row {
    start: number;
    count: number;
    sumR: number;
    rowH: number;
  }

  let bestRows: Row[] | null = null;
  let bestScale = 1;
  let bestArea = -1;

  for (const comp of rowCompositions(sizes.length)) {
    const rows: Row[] = [];
    let start = 0;
    let totalH = gap * (comp.length - 1);
    for (const count of comp) {
      const sumR = ratios.slice(start, start + count).reduce((a, b) => a + b, 0);
      const rowH = (bandW - gap * (count - 1)) / sumR;
      rows.push({ start, count, sumR, rowH });
      totalH += rowH;
      start += count;
    }
    const scale = Math.min(1, bandH / totalH);
    let area = 0;
    for (const row of rows) {
      area += (row.rowH * scale) ** 2 * row.sumR;
    }
    if (area > bestArea) {
      bestArea = area;
      bestRows = rows;
      bestScale = scale;
    }
  }

  const rows = bestRows!;
  const scale = bestScale;
  const scaledGap = gap * scale;
  const totalH =
    rows.reduce((a, row) => a + row.rowH * scale, 0) + scaledGap * (rows.length - 1);
  // Every justified row spans scale * bandW, so the whole block shares one left edge.
  const x0 = (bandW - bandW * scale) / 2;

  const rects: PhotobookImageRect[] = [];
  let y = (bandH - totalH) / 2;
  for (const row of rows) {
    const rowH = row.rowH * scale;
    let x = x0;
    for (let i = row.start; i < row.start + row.count; i++) {
      const w = ratios[i]! * rowH;
      rects.push({ x, y, w, h: rowH });
      x += w + scaledGap;
    }
    y += rowH + scaledGap;
  }
  return rects;
}

export interface PhotobookPagePlanOptions {
  /** Product minimum interior page count (blank pages are appended below it). */
  minPages: number;
  maxImagesPerPage: number;
}

/**
 * Pages allotted to each entry. The baseline is ceil(images / maxImagesPerPage)
 * (one page for image-less entries); while the trip totals fewer pages than the
 * product minimum, the densest entry is given one more page — so images spread
 * out to replace blank padding pages. Spreading never pushes the total past
 * `minPages` and never goes below one image per page.
 */
export function planPhotobookEntryPageCounts(
  imageCounts: number[],
  opts: PhotobookPagePlanOptions,
): number[] {
  const pages = imageCounts.map((n) => Math.max(1, Math.ceil(n / opts.maxImagesPerPage)));
  let total = pages.reduce((a, b) => a + b, 0);
  while (total < opts.minPages) {
    let best = -1;
    let bestDensity = 1;
    for (let i = 0; i < imageCounts.length; i++) {
      if (pages[i]! >= imageCounts[i]!) continue;
      const density = imageCounts[i]! / pages[i]!;
      if (density > bestDensity) {
        bestDensity = density;
        best = i;
      }
    }
    if (best < 0) break;
    pages[best]! += 1;
    total += 1;
  }
  return pages;
}

/** Split an entry's images into `pageCount` chronological pages of near-equal size. */
export function splitPhotobookImagesAcrossPages<T>(items: T[], pageCount: number): T[][] {
  if (items.length === 0) return [[]];
  const pages = Math.max(1, Math.min(pageCount, items.length));
  const out: T[][] = [];
  let start = 0;
  for (let p = 0; p < pages; p++) {
    const size = Math.ceil((items.length - start) / (pages - p));
    out.push(items.slice(start, start + size));
    start += size;
  }
  return out;
}
