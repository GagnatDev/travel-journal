import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import type { Entry, EntryImage, Trip } from '@travel-journal/shared';
import {
  PHOTOBOOK_PDF_STRINGS,
  type PhotobookPdfLocaleKey,
  formatPhotobookFooterDayDate,
  photobookPdfIntlLocale,
  resolvePhotobookPdfLocaleKey,
} from '@travel-journal/shared';

import { logger } from '../logger.js';
import { getObjectBuffer } from './media.service.js';
import { resolvePhotobookEmojiFontPaths } from './trip-photobook-fonts.js';
import { registerPhotobookFonts, setPhotobookFont } from './trip-photobook-pdf-fonts.js';
import {
  drawPhotobookPdfUserText,
  openPhotobookEmojiKitFonts,
  registerPhotobookEmojiFonts,
  type PhotobookPdfFontState,
} from './trip-photobook-pdf-text.js';
import { attachPhotobookPdfX4 } from './trip-photobook-pdfx.js';
import {
  collectPhotobookEntryLocations,
  fetchPhotobookMapStaticPng,
  getPhotobookPdfMapboxToken,
  photobookMapStaticRequestPixels,
} from './trip-photobook-map-static.js';

type PDFDoc = InstanceType<typeof PDFDocument>;

const MM = 72 / 25.4;
/** Hardcover trim: 9 inch square (was 210mm A4-ish square). */
const TRIM_MM = 228.6;
// TODO: confirm bleed from Prodigi hardcover file-setup guidelines
const BLEED_MM = 3;
const TRIM_PT = TRIM_MM * MM;
const BLEED_PT = BLEED_MM * MM;
/** Full-bleed page (trim + bleed on every edge) used for interior, cover and preview. */
const PAGE_FULL_PT = TRIM_PT + 2 * BLEED_PT;
// TODO: confirm Prodigi safe-area; content is kept inside bleed + this inset
const SAFE_INSET_MM = 6;
/** Content inset measured from the full-bleed edge: cream background bleeds to the edge, content stays inside the safe area. */
const CONTENT_MARGIN = BLEED_PT + SAFE_INSET_MM * MM;
// TODO: confirm spine width formula / query Prodigi
const PAPER_THICKNESS_MM = 0.12;
/** Interior must be even and at least this many pages. */
// TODO: confirm Prodigi page-count increment rules
const MIN_INTERIOR_PAGES = 24;

/** Spine strip width (pt) for a given interior page count. */
function spineWidth(pageCount: number): number {
  // TODO: confirm spine width formula / query Prodigi
  const leaves = pageCount / 2;
  const widthPt = leaves * PAPER_THICKNESS_MM * MM;
  return Math.max(1, widthPt);
}

const GAP = 2 * MM;
const MAX_IMAGES_PER_PAGE = 4;

/** Vertical reserve below image band when entry has body text (separator + paragraph). */
const BODY_RESERVE_WITH_TEXT_MM = 34;
const BODY_RESERVE_EMPTY_MM = 3;

const CREAM = '#fbf9f5';
const ACCENT = '#9b3f2b';
const BODY = '#58624a';
const CAPTION = '#70573f';

/** Mapbox / OSM attribution for static map page (image uses attribution=false). */
const PHOTOBOOK_MAP_ATTRIBUTION = '© Mapbox © OpenStreetMap';

function pdfImageRasterDpr(): number {
  const raw = process.env['TRIP_PDF_IMAGE_DPR'];
  if (raw === undefined || raw === '') return 5;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.min(6, Math.max(1, n));
}

/** Bottom Y of the content area (inside bleed + safe inset). */
function pageContentBottom(): number {
  return PAGE_FULL_PT - CONTENT_MARGIN;
}

function dayKeyInTimeZone(iso: string, timeZone: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function formatEntryPageDate(iso: string, timeZone: string, intlLocale: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
    .format(d)
    .toUpperCase();
}

function formatTripDateLong(iso: string | undefined, intlLocale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

function formatCoverDateRange(trip: Trip, intlLocale: string): string {
  const dep = formatTripDateLong(trip.departureDate, intlLocale);
  const ret = formatTripDateLong(trip.returnDate, intlLocale);
  if (dep && ret) return `${dep.toUpperCase()} – ${ret.toUpperCase()}`;
  if (dep) return dep.toUpperCase();
  if (ret) return ret.toUpperCase();
  return '';
}

export interface TripPhotobookPdfInput {
  trip: Trip;
  entries: Entry[];
  timeZone?: string;
  photobookLocaleKey?: PhotobookPdfLocaleKey;
}

function sortedImages(images: EntryImage[]): EntryImage[] {
  return [...images].sort((a, b) => a.order - b.order);
}

function groupEntriesByDay(entries: Entry[], timeZone: string): Map<string, Entry[]> {
  const sorted = [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const map = new Map<string, Entry[]>();
  for (const e of sorted) {
    const key = dayKeyInTimeZone(e.createdAt, timeZone);
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return map;
}

function fillPageBackground(doc: PDFDoc): void {
  doc.save();
  // Cream bleeds to the full edge of the full-bleed page.
  doc.rect(0, 0, PAGE_FULL_PT, PAGE_FULL_PT).fill(CREAM);
  doc.restore();
}

function addSquarePage(doc: PDFDoc): void {
  doc.addPage({
    size: [PAGE_FULL_PT, PAGE_FULL_PT],
    margins: { top: CONTENT_MARGIN, bottom: CONTENT_MARGIN, left: CONTENT_MARGIN, right: CONTENT_MARGIN },
  });
  fillPageBackground(doc);
}

function collectTripImageKeys(entries: Entry[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    for (const img of sortedImages(e.images)) {
      if (!seen.has(img.key)) {
        seen.add(img.key);
        keys.push(img.key);
      }
    }
  }
  return keys;
}

function pickRandomCoverKey(keys: string[]): string | undefined {
  if (keys.length === 0) return undefined;
  const i = Math.floor(Math.random() * keys.length);
  return keys[i];
}

/** User-picked cover when valid; otherwise a random trip photo. */
export function resolvePhotobookCoverKey(trip: Trip, entries: Entry[]): string | undefined {
  const keys = collectTripImageKeys(entries);
  const desired = trip.photobookCoverImageKey?.trim();
  if (desired && keys.includes(desired)) {
    return desired;
  }
  return pickRandomCoverKey(keys);
}

async function loadImageBufferForKey(key: string): Promise<Buffer | null> {
  try {
    return await getObjectBuffer(key);
  } catch {
    return null;
  }
}

interface EntryImageSlot {
  meta: EntryImage;
  buffer: Buffer;
}

async function loadEntryImageSlots(entry: Entry): Promise<EntryImageSlot[]> {
  const imgs = sortedImages(entry.images);
  const out: EntryImageSlot[] = [];
  for (const img of imgs) {
    try {
      out.push({ meta: img, buffer: await getObjectBuffer(img.key) });
    } catch {
      if (img.thumbnailKey) {
        try {
          out.push({ meta: img, buffer: await getObjectBuffer(img.thumbnailKey) });
        } catch {
          // skip
        }
      }
    }
  }
  return out;
}

async function toPdfImageJpeg(buffer: Buffer, layoutWPt: number, layoutHPt: number): Promise<Buffer> {
  const dpr = pdfImageRasterDpr();
  const maxW = Math.max(1, Math.ceil(layoutWPt * dpr));
  const maxH = Math.max(1, Math.ceil(layoutHPt * dpr));
  return sharp(buffer)
    .rotate()
    .resize(maxW, maxH, {
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .toColourspace('srgb')
    .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

async function intrinsicImageSizePt(buffer: Buffer): Promise<{ iw: number; ih: number }> {
  const meta = await sharp(buffer).rotate().metadata();
  const iw = Math.max(1, meta.width ?? 1);
  const ih = Math.max(1, meta.height ?? 1);
  return { iw, ih };
}

type PhotoOrient = 'portrait' | 'landscape' | 'square';

function classifyOrient(iw: number, ih: number): PhotoOrient {
  const r = iw / ih;
  if (r < 0.92) return 'portrait';
  if (r > 1.08) return 'landscape';
  return 'square';
}

async function intrinsicsForSlots(
  slots: EntryImageSlot[],
): Promise<Array<{ iw: number; ih: number; o: PhotoOrient; slot: EntryImageSlot }>> {
  return Promise.all(
    slots.map(async (slot) => {
      try {
        const { iw, ih } = await intrinsicImageSizePt(slot.buffer);
        return { iw, ih, o: classifyOrient(iw, ih), slot };
      } catch {
        return { iw: 1, ih: 1, o: 'square' as const, slot };
      }
    }),
  );
}

/** Scale image to fit inside maxImgW × maxImgH while preserving aspect ratio. */
function computeImageFitLayout(
  iw: number,
  ih: number,
  maxImgW: number,
  maxImgH: number,
): { imgW: number; imgH: number } {
  const scale = Math.min(maxImgW / Math.max(1, iw), maxImgH / Math.max(1, ih));
  return { imgW: iw * scale, imgH: ih * scale };
}

/** Centered image in the slot; no frame, shadow, or canvas rotation. */
async function drawPhotobookImage(
  doc: PDFDoc,
  fontsOk: boolean,
  slot: EntryImageSlot,
  imagePlaceholder: string,
  cx: number,
  cy: number,
  maxImgW: number,
  maxImgH: number,
): Promise<void> {
  let iw: number;
  let ih: number;
  try {
    ({ iw, ih } = await intrinsicImageSizePt(slot.buffer));
  } catch {
    iw = maxImgW;
    ih = maxImgH;
  }

  const { imgW, imgH } = computeImageFitLayout(iw, ih, maxImgW, maxImgH);
  const left = cx - imgW / 2;
  const top = cy - imgH / 2;

  try {
    const jpg = await toPdfImageJpeg(slot.buffer, imgW, imgH);
    doc.image(jpg, left, top, { width: imgW, height: imgH });
  } catch {
    doc.rect(left, top, imgW, imgH).stroke('#cccccc');
    setPhotobookFont(doc, fontsOk, 'ui');
    doc.fontSize(8).fillColor(CAPTION).text(imagePlaceholder, left, top + imgH / 2 - 4, {
      width: imgW,
      align: 'center',
    });
  }
}

async function embedPhotobookImages(
  doc: PDFDoc,
  fontsOk: boolean,
  slots: EntryImageSlot[],
  imagePlaceholder: string,
  bandLeft: number,
  bandTop: number,
  bandW: number,
  bandH: number,
): Promise<void> {
  const n = Math.min(slots.length, MAX_IMAGES_PER_PAGE);
  if (n === 0) return;

  const cxMid = bandLeft + bandW / 2;
  const cyMid = bandTop + bandH / 2;

  if (n === 1) {
    await drawPhotobookImage(doc, fontsOk, slots[0]!, imagePlaceholder, cxMid, cyMid, bandW * 0.98, bandH * 0.98);
    return;
  }

  const infos = await intrinsicsForSlots(slots.slice(0, n));

  const isPortraitLike = (o: PhotoOrient) => o === 'portrait' || o === 'square';
  const isLandscapeLike = (o: PhotoOrient) => o === 'landscape';

  if (n === 2) {
    const a = infos[0]!;
    const b = infos[1]!;
    const ap = isPortraitLike(a.o);
    const bp = isPortraitLike(b.o);
    const al = isLandscapeLike(a.o);
    const bl = isLandscapeLike(b.o);

    const bothPortraitLike = ap && bp && !al && !bl;
    const bothLandscapeLike = al && bl && !ap && !bp;

    if (bothPortraitLike) {
      const colW = (bandW - GAP) / 2;
      const cx0 = bandLeft + colW / 2;
      const cx1 = bandLeft + colW + GAP + colW / 2;
      const cy = cyMid;
      await drawPhotobookImage(doc, fontsOk, a.slot, imagePlaceholder, cx0, cy, colW * 0.97, bandH * 0.97);
      await drawPhotobookImage(doc, fontsOk, b.slot, imagePlaceholder, cx1, cy, colW * 0.97, bandH * 0.97);
      return;
    }

    if (bothLandscapeLike) {
      const rowH = (bandH - GAP) / 2;
      const cy0 = bandTop + rowH / 2;
      const cy1 = bandTop + rowH + GAP + rowH / 2;
      await drawPhotobookImage(doc, fontsOk, a.slot, imagePlaceholder, cxMid, cy0, bandW * 0.97, rowH * 0.97);
      await drawPhotobookImage(doc, fontsOk, b.slot, imagePlaceholder, cxMid, cy1, bandW * 0.97, rowH * 0.97);
      return;
    }

    const stackW = bandW * 0.58;
    const sideW = bandW - stackW - GAP;

    if (al && !bl && bp) {
      const cxL = bandLeft + stackW / 2;
      const cxR = bandLeft + stackW + GAP + sideW / 2;
      await drawPhotobookImage(doc, fontsOk, a.slot, imagePlaceholder, cxL, cyMid, stackW * 0.96, bandH * 0.97);
      await drawPhotobookImage(doc, fontsOk, b.slot, imagePlaceholder, cxR, cyMid, sideW * 0.96, bandH * 0.97);
      return;
    }
    if (ap && !bp && bl) {
      const cxL = bandLeft + sideW / 2;
      const cxR = bandLeft + sideW + GAP + stackW / 2;
      await drawPhotobookImage(doc, fontsOk, a.slot, imagePlaceholder, cxL, cyMid, sideW * 0.96, bandH * 0.97);
      await drawPhotobookImage(doc, fontsOk, b.slot, imagePlaceholder, cxR, cyMid, stackW * 0.96, bandH * 0.97);
      return;
    }
    if (bl && !al && ap) {
      const cxL = bandLeft + stackW / 2;
      const cxR = bandLeft + stackW + GAP + sideW / 2;
      await drawPhotobookImage(doc, fontsOk, b.slot, imagePlaceholder, cxL, cyMid, stackW * 0.96, bandH * 0.97);
      await drawPhotobookImage(doc, fontsOk, a.slot, imagePlaceholder, cxR, cyMid, sideW * 0.96, bandH * 0.97);
      return;
    }

    const cxL = bandLeft + stackW / 2;
    const cxR = bandLeft + stackW + GAP + sideW / 2;
    await drawPhotobookImage(doc, fontsOk, a.slot, imagePlaceholder, cxL, cyMid, stackW * 0.96, bandH * 0.97);
    await drawPhotobookImage(doc, fontsOk, b.slot, imagePlaceholder, cxR, cyMid, sideW * 0.96, bandH * 0.97);
    return;
  }

  if (n === 3) {
    const lInfos = infos.filter((x) => isLandscapeLike(x.o));
    const pInfos = infos.filter((x) => x.o === 'portrait');
    const tallCount = infos.filter((x) => isPortraitLike(x.o)).length;
    const wideCount = lInfos.length;

    if (tallCount === 3) {
      const colW = (bandW - 2 * GAP) / 3;
      for (let i = 0; i < 3; i++) {
        const cx = bandLeft + colW / 2 + i * (colW + GAP);
        await drawPhotobookImage(doc, fontsOk, infos[i]!.slot, imagePlaceholder, cx, cyMid, colW * 0.96, bandH * 0.96);
      }
      return;
    }

    if (wideCount === 3) {
      const rowH = (bandH - 2 * GAP) / 3;
      for (let i = 0; i < 3; i++) {
        const cy = bandTop + rowH / 2 + i * (rowH + GAP);
        await drawPhotobookImage(
          doc,
          fontsOk,
          infos[i]!.slot,
          imagePlaceholder,
          cxMid,
          cy,
          bandW * 0.96,
          rowH * 0.96,
        );
      }
      return;
    }

    if (wideCount === 2 && pInfos.length === 1) {
      const stackW = bandW * 0.58;
      const sideW = bandW - stackW - GAP;
      const rowH = (bandH - GAP) / 2;
      const cxL = bandLeft + stackW / 2;
      const cxR = bandLeft + stackW + GAP + sideW / 2;
      const cy0 = bandTop + rowH / 2;
      const cy1 = bandTop + rowH + GAP + rowH / 2;
      const [L1, L2] = [lInfos[0]!, lInfos[1]!];
      const P = pInfos[0]!;
      await drawPhotobookImage(doc, fontsOk, L1.slot, imagePlaceholder, cxL, cy0, stackW * 0.95, rowH * 0.95);
      await drawPhotobookImage(doc, fontsOk, L2.slot, imagePlaceholder, cxL, cy1, stackW * 0.95, rowH * 0.95);
      await drawPhotobookImage(doc, fontsOk, P.slot, imagePlaceholder, cxR, cyMid, sideW * 0.95, bandH * 0.97);
      return;
    }

    if (pInfos.length === 2 && wideCount === 1) {
      const sideW = bandW * 0.42;
      const stackW = bandW - sideW - GAP;
      const rowH = (bandH - GAP) / 2;
      const cxL = bandLeft + sideW / 2;
      const cxR = bandLeft + sideW + GAP + stackW / 2;
      const cy0 = bandTop + rowH / 2;
      const cy1 = bandTop + rowH + GAP + rowH / 2;
      const [P1, P2] = [pInfos[0]!, pInfos[1]!];
      const L = lInfos[0]!;
      await drawPhotobookImage(doc, fontsOk, P1.slot, imagePlaceholder, cxL, cy0, sideW * 0.95, rowH * 0.95);
      await drawPhotobookImage(doc, fontsOk, P2.slot, imagePlaceholder, cxL, cy1, sideW * 0.95, rowH * 0.95);
      await drawPhotobookImage(doc, fontsOk, L.slot, imagePlaceholder, cxR, cyMid, stackW * 0.95, bandH * 0.97);
      return;
    }

    const colW = (bandW - 2 * GAP) / 3;
    for (let i = 0; i < 3; i++) {
      const cx = bandLeft + colW / 2 + i * (colW + GAP);
      await drawPhotobookImage(doc, fontsOk, infos[i]!.slot, imagePlaceholder, cx, cyMid, colW * 0.94, bandH * 0.94);
    }
    return;
  }

  if (n === 4) {
    const cols = 2;
    const rows = 2;
    const cellW = (bandW - GAP) / cols;
    const cellH = (bandH - GAP) / rows;
    for (let i = 0; i < 4; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = bandLeft + col * (cellW + GAP) + cellW / 2;
      const cy = bandTop + row * (cellH + GAP) + cellH / 2;
      await drawPhotobookImage(doc, fontsOk, infos[i]!.slot, imagePlaceholder, cx, cy, cellW * 0.96, cellH * 0.96);
    }
  }
}

async function drawCoverPage(
  doc: PDFDoc,
  fontState: PhotobookPdfFontState,
  trip: Trip,
  strings: (typeof PHOTOBOOK_PDF_STRINGS)['nb'],
  intlLocale: string,
  coverBuf: Buffer | null,
): Promise<void> {
  // TODO: Prodigi 'cover' may expect a full wrap (back + spine + front) — confirm against hardcover file-setup guidelines.
  // Current implementation renders the front-cover artwork at full bleed.
  addSquarePage(doc);

  const w = PAGE_FULL_PT - 2 * CONTENT_MARGIN;
  let y = CONTENT_MARGIN + 8;

  setPhotobookFont(doc, fontState.fontsOk, 'display');
  drawPhotobookPdfUserText(doc, fontState, 'display', 26, ACCENT, trip.name, CONTENT_MARGIN, y, { width: w, align: 'center' });
  y = doc.y + 10;

  const range = formatCoverDateRange(trip, intlLocale);
  if (range) {
    setPhotobookFont(doc, fontState.fontsOk, 'uiMedium');
    doc.fontSize(9).fillColor(CAPTION).text(range, CONTENT_MARGIN, y, { width: w, align: 'center', lineGap: 1 });
    y = doc.y + 14;
  }

  if (trip.description?.trim()) {
    drawPhotobookPdfUserText(doc, fontState, 'ui', 10, BODY, trip.description.trim(), CONTENT_MARGIN, y, {
      width: w,
      align: 'center',
      lineGap: 2,
    });
    y = doc.y + 12;
  }

  const heroTop = y + 6;
  const heroBottom = pageContentBottom() - 8;
  const heroH = Math.max(80, heroBottom - heroTop);
  const heroW = Math.min(w * 0.88, heroH * 1.15);
  const cx = PAGE_FULL_PT / 2;
  const cy = heroTop + heroH / 2;

  if (coverBuf) {
    const fakeSlot: EntryImageSlot = {
      meta: { key: '', width: 1, height: 1, order: 0, uploadedAt: new Date(0).toISOString() },
      buffer: coverBuf,
    };
    await drawPhotobookImage(doc, fontState.fontsOk, fakeSlot, strings.imagePlaceholder, cx, cy, heroW * 0.92, heroH * 0.92);
  } else {
    setPhotobookFont(doc, fontState.fontsOk, 'ui');
    doc.fontSize(10).fillColor(CAPTION).text(strings.coverNoPhotoHint, CONTENT_MARGIN, cy - 6, { width: w, align: 'center' });
  }
}

/** A single PDFKit output document with its end-promise and font state. */
interface PhotobookDoc {
  doc: PDFDoc;
  fontState: PhotobookPdfFontState;
  /** Resolves with the full buffer once `doc.end()` is called. */
  done: Promise<Buffer>;
}

/**
 * Create one full-bleed PDFKit document, attach PDF/X-4, register fonts + emoji and wire up
 * chunk collection. Each output asset (interior, cover, preview) is its own document.
 */
async function createPhotobookDoc(width: number, height: number): Promise<PhotobookDoc> {
  const doc = new PDFDocument({
    size: [width, height],
    margins: { top: CONTENT_MARGIN, bottom: CONTENT_MARGIN, left: CONTENT_MARGIN, right: CONTENT_MARGIN },
    autoFirstPage: false,
    pdfVersion: '1.6',
  });

  await attachPhotobookPdfX4(doc);

  const fontsOk = registerPhotobookFonts(doc);

  const emojiPaths = resolvePhotobookEmojiFontPaths();
  const emojiKitFonts = openPhotobookEmojiKitFonts(emojiPaths);
  let emojiFontsRegistered = false;
  if (emojiPaths?.length) {
    try {
      registerPhotobookEmojiFonts(doc, emojiPaths);
      emojiFontsRegistered = true;
    } catch (err) {
      logger.warn({ err }, 'Photobook PDF: emoji font registration failed');
    }
  }

  const fontState: PhotobookPdfFontState = {
    fontsOk,
    emojiFontsRegistered,
    emojiKitFonts: emojiKitFonts ?? null,
  };

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  return { doc, fontState, done };
}

/** Pre-loaded image slots for one entry, plus its day index and date string. */
interface PreloadedEntry {
  entry: Entry;
  dayNum: number;
  dayDatePart: string;
  imageSlots: EntryImageSlot[];
}

/** A map overview page rastered once and replayed into interior + preview. */
interface PreloadedMap {
  raster: Buffer;
  mapLeft: number;
  mapTop: number;
  mapW: number;
  mapH: number;
  footerBand: number;
}

interface PreloadedContent {
  entries: PreloadedEntry[];
  map: PreloadedMap | null;
  coverBuf: Buffer | null;
}

/**
 * Fetch every entry image, the cover image and the map raster exactly once so the same buffers
 * (including a possibly-random cover) can be replayed into both interior and preview documents.
 */
async function preloadPhotobookContent(
  input: TripPhotobookPdfInput,
  timeZone: string,
  intlLocale: string,
): Promise<PreloadedContent> {
  const byDay = groupEntriesByDay(input.entries, timeZone);
  const dayKeys = [...byDay.keys()].sort();

  const entries: PreloadedEntry[] = [];
  for (let d = 0; d < dayKeys.length; d++) {
    const dayNum = d + 1;
    const dayEntries = byDay.get(dayKeys[d]!)!;
    const dayDatePart = formatEntryPageDate(dayEntries[0]!.createdAt, timeZone, intlLocale);
    for (const entry of dayEntries) {
      const imageSlots = await loadEntryImageSlots(entry);
      entries.push({ entry, dayNum, dayDatePart, imageSlots });
    }
  }

  const coverKey = resolvePhotobookCoverKey(input.trip, input.entries);
  const coverBuf = coverKey ? await loadImageBufferForKey(coverKey) : null;

  let map: PreloadedMap | null = null;
  const mapPoints = collectPhotobookEntryLocations(input.entries);
  const mapToken = getPhotobookPdfMapboxToken();
  if (mapPoints.length > 0 && mapToken) {
    const innerBottom = pageContentBottom();
    const footerBand = 3.2 * MM;
    const footerGap = 0.8 * MM;
    const mapTop = CONTENT_MARGIN;
    const mapLeft = CONTENT_MARGIN;
    const mapW = PAGE_FULL_PT - 2 * CONTENT_MARGIN;
    const mapH = Math.max(48, innerBottom - mapTop - footerBand - footerGap);
    const { widthPx, heightPx } = photobookMapStaticRequestPixels(mapW, mapH);
    const mapBuf = await fetchPhotobookMapStaticPng({
      points: mapPoints,
      widthPx,
      heightPx,
      accessToken: mapToken,
    });
    if (mapBuf) {
      try {
        const dpr = pdfImageRasterDpr();
        const rw = Math.max(1, Math.ceil(mapW * dpr));
        const rh = Math.max(1, Math.ceil(mapH * dpr));
        const raster = await sharp(mapBuf)
          .rotate()
          .resize(rw, rh, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
        map = { raster, mapLeft, mapTop, mapW, mapH, footerBand };
      } catch (err) {
        logger.warn({ err }, 'Photobook PDF: map overview page raster failed');
      }
    }
  }

  return { entries, map, coverBuf };
}

/**
 * Draw all entry pages (+ empty-trip disclaimer + map page) into `doc` from pre-loaded content.
 * Does NOT draw the cover. Returns the number of pages added.
 */
async function drawEntryPages(
  doc: PDFDoc,
  fontState: PhotobookPdfFontState,
  content: PreloadedContent,
  strings: (typeof PHOTOBOOK_PDF_STRINGS)['nb'],
): Promise<number> {
  const fontsOk = fontState.fontsOk;
  const innerBottom = pageContentBottom();
  let pages = 0;

  if (content.entries.length === 0) {
    addSquarePage(doc);
    pages++;
    setPhotobookFont(doc, fontsOk, 'display');
    doc.fontSize(13).fillColor(BODY).text(strings.emptyTripDisclaimer, CONTENT_MARGIN, CONTENT_MARGIN, {
      width: PAGE_FULL_PT - 2 * CONTENT_MARGIN,
      align: 'center',
    });
    return pages;
  }

  for (const { entry, dayNum, dayDatePart, imageSlots } of content.entries) {
    const imagePageCount =
      imageSlots.length === 0 ? 1 : Math.ceil(imageSlots.length / MAX_IMAGES_PER_PAGE);

    for (let p = 0; p < imagePageCount; p++) {
      addSquarePage(doc);
      pages++;

      const top = CONTENT_MARGIN + 4;
      let y = top;

      const headerLine = formatPhotobookFooterDayDate(strings.entryPageHeaderTemplate, dayNum, dayDatePart);
      setPhotobookFont(doc, fontsOk, 'uiMedium');
      doc.fontSize(8).fillColor(CAPTION).text(headerLine, CONTENT_MARGIN, y, {
        width: PAGE_FULL_PT - 2 * CONTENT_MARGIN,
      });
      y = doc.y + (p === 0 ? 8 : 10);

      if (p === 0) {
        drawPhotobookPdfUserText(doc, fontState, 'displayItalic', 17, ACCENT, entry.title, CONTENT_MARGIN, y, {
          width: PAGE_FULL_PT - 2 * CONTENT_MARGIN,
        });
        y = doc.y + 10;
      }

      const slice = imageSlots.slice(p * MAX_IMAGES_PER_PAGE, (p + 1) * MAX_IMAGES_PER_PAGE);
      const hasBodyText = Boolean(p === 0 && entry.content?.trim());
      const textReservePt =
        slice.length > 0
          ? hasBodyText
            ? BODY_RESERVE_WITH_TEXT_MM * MM
            : BODY_RESERVE_EMPTY_MM * MM
          : 0;
      const bandTop = y + 2;
      const imageBandH = slice.length > 0 ? Math.max(48, innerBottom - bandTop - textReservePt) : 0;

      if (slice.length > 0) {
        const bandLeft = CONTENT_MARGIN;
        const bandW = PAGE_FULL_PT - 2 * CONTENT_MARGIN;
        await embedPhotobookImages(
          doc,
          fontState.fontsOk,
          slice,
          strings.imagePlaceholder,
          bandLeft,
          bandTop,
          bandW,
          imageBandH,
        );
      } else if (p === 0) {
        drawPhotobookPdfUserText(doc, fontState, 'displayItalic', 10, BODY, entry.content ?? '', CONTENT_MARGIN, y, {
          width: PAGE_FULL_PT - 2 * CONTENT_MARGIN,
          height: innerBottom - y - 4,
          align: 'center',
          lineGap: 3,
        });
      }

      if (slice.length > 0 && p === 0 && hasBodyText) {
        const sepY = bandTop + imageBandH + 4;
        doc.save();
        doc.strokeColor('#e0d8cc')
          .lineWidth(0.35)
          .moveTo(CONTENT_MARGIN + 28, sepY)
          .lineTo(PAGE_FULL_PT - CONTENT_MARGIN - 28, sepY)
          .stroke();
        doc.restore();

        const bodyY = sepY + 10;
        drawPhotobookPdfUserText(doc, fontState, 'displayItalic', 9, BODY, entry.content ?? '', CONTENT_MARGIN, bodyY, {
          width: PAGE_FULL_PT - 2 * CONTENT_MARGIN,
          height: innerBottom - bodyY - 4,
          align: 'center',
          lineGap: 3,
        });
      }
    }
  }

  if (content.map) {
    const { raster, mapLeft, mapTop, mapW, mapH, footerBand } = content.map;
    addSquarePage(doc);
    pages++;
    doc.image(raster, mapLeft, mapTop, { width: mapW, height: mapH });
    setPhotobookFont(doc, fontsOk, 'ui');
    doc
      .fontSize(5.2)
      .fillColor(CAPTION)
      .text(PHOTOBOOK_MAP_ATTRIBUTION, mapLeft, innerBottom - footerBand + 0.3 * MM, {
        width: mapW,
        align: 'center',
      });
  }

  return pages;
}

/** Append blank cream pages until the interior is even and at least the product minimum. */
function targetInteriorPageCount(pagesDrawn: number): number {
  // TODO: confirm Prodigi page-count increment rules
  let target = Math.max(MIN_INTERIOR_PAGES, pagesDrawn);
  if (target % 2 !== 0) target += 1;
  return target;
}

export interface TripPhotobookPdfResult {
  /** Entry pages (+ map), no cover, padded to an even count >= MIN_INTERIOR_PAGES. */
  interior: Buffer;
  /** Front-cover artwork at full bleed. */
  cover: Buffer;
  /** Thin cream spine strip sized from `pageCount`. */
  spine: Buffer;
  /** Merged cover + interior (unpadded) for the creator download UX. */
  preview: Buffer;
  /** Final interior page count (after padding). */
  pageCount: number;
}

/**
 * Build the Prodigi print assets for a trip photobook: a padded full-bleed interior, the cover
 * artwork, a spine strip, and a merged preview. Each asset is its own PDFKit document; entry images
 * and the (possibly random) cover image are loaded once and replayed across documents.
 */
export async function buildTripPhotobookPdf(input: TripPhotobookPdfInput): Promise<TripPhotobookPdfResult> {
  const timeZone = input.timeZone ?? process.env['TRIP_PDF_TIMEZONE'] ?? 'UTC';
  const localeKey =
    input.photobookLocaleKey ?? resolvePhotobookPdfLocaleKey(process.env['TRIP_PDF_LOCALE'] ?? 'nb');
  const strings = PHOTOBOOK_PDF_STRINGS[localeKey];
  const intlLocale = photobookPdfIntlLocale(localeKey);

  const content = await preloadPhotobookContent(input, timeZone, intlLocale);

  // --- interior: entry pages only, padded to an even count >= MIN_INTERIOR_PAGES ---
  const interiorDoc = await createPhotobookDoc(PAGE_FULL_PT, PAGE_FULL_PT);
  const pagesDrawn = await drawEntryPages(interiorDoc.doc, interiorDoc.fontState, content, strings);
  const pageCount = targetInteriorPageCount(pagesDrawn);
  for (let i = pagesDrawn; i < pageCount; i++) {
    addSquarePage(interiorDoc.doc);
  }
  interiorDoc.doc.end();
  const interior = await interiorDoc.done;

  // --- cover: front-cover artwork at full bleed ---
  const coverDoc = await createPhotobookDoc(PAGE_FULL_PT, PAGE_FULL_PT);
  await drawCoverPage(coverDoc.doc, coverDoc.fontState, input.trip, strings, intlLocale, content.coverBuf);
  coverDoc.doc.end();
  const cover = await coverDoc.done;

  // --- spine: thin cream strip sized from the interior page count ---
  const spineDoc = await createPhotobookDoc(spineWidth(pageCount), PAGE_FULL_PT);
  spineDoc.doc.addPage({ size: [spineWidth(pageCount), PAGE_FULL_PT], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  spineDoc.doc.save();
  spineDoc.doc.rect(0, 0, spineWidth(pageCount), PAGE_FULL_PT).fill(CREAM);
  spineDoc.doc.restore();
  spineDoc.doc.end();
  const spine = await spineDoc.done;

  // --- preview: cover + interior (unpadded), stored as the creator-facing pdfStorageKey ---
  const previewDoc = await createPhotobookDoc(PAGE_FULL_PT, PAGE_FULL_PT);
  await drawCoverPage(previewDoc.doc, previewDoc.fontState, input.trip, strings, intlLocale, content.coverBuf);
  await drawEntryPages(previewDoc.doc, previewDoc.fontState, content, strings);
  previewDoc.doc.end();
  const preview = await previewDoc.done;

  return { interior, cover, spine, preview, pageCount };
}
