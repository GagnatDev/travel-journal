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
import { resolvePhotobookFontPaths } from './trip-photobook-fonts.js';

type PDFDoc = InstanceType<typeof PDFDocument>;

const MM = 72 / 25.4;
const PAGE_SIZE_PT = 210 * MM;
const MARGIN = 10 * MM;
const GAP = 2 * MM;
const MAX_IMAGES_PER_PAGE = 4;

/** Vertical reserve below image band when entry has body text (separator + paragraph). */
const BODY_RESERVE_WITH_TEXT_MM = 34;
const BODY_RESERVE_EMPTY_MM = 3;

/** Polaroid-style card: white bottom strip + side padding (points). */
const POLAROID_SIDE_PAD = 8;
const POLAROID_TOP_PAD = 6;
const POLAROID_BOTTOM_STRIP = 16;
const POLAROID_IMG_CORNER = 2;
const POLAROID_CARD_CORNER = 3;

const CREAM = '#fbf9f5';
const ACCENT = '#9b3f2b';
const BODY = '#58624a';
const CAPTION = '#70573f';
const FRAME_WHITE = '#ffffff';
const SHADOW = '#1b1c1a';

const FONT = {
  display: 'PhotobookDisplay',
  displayItalic: 'PhotobookDisplayItalic',
  ui: 'PhotobookUI',
  uiMedium: 'PhotobookUIMedium',
} as const;

function pdfImageRasterDpr(): number {
  const raw = process.env['TRIP_PDF_IMAGE_DPR'];
  if (raw === undefined || raw === '') return 3;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 3;
  return Math.min(4, Math.max(1, n));
}

/** Bottom Y of the content area (10 mm margin). */
function pageContentBottom(): number {
  return PAGE_SIZE_PT - MARGIN;
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

function registerPhotobookFonts(doc: PDFDoc): boolean {
  const paths = resolvePhotobookFontPaths();
  if (!paths) {
    logger.warn('Photobook PDF: font files missing; using Helvetica (not embedded app fonts)');
    return false;
  }
  try {
    doc.registerFont(FONT.display, paths.display);
    doc.registerFont(FONT.displayItalic, paths.displayItalic);
    doc.registerFont(FONT.ui, paths.ui);
    doc.registerFont(FONT.uiMedium, paths.uiMedium);
    return true;
  } catch (err) {
    logger.warn({ err }, 'Photobook PDF: font registration failed; using Helvetica');
    return false;
  }
}

function setPhotobookFont(doc: PDFDoc, fontsOk: boolean, role: 'display' | 'displayItalic' | 'ui' | 'uiMedium'): void {
  if (!fontsOk) {
    const fb =
      role === 'display'
        ? 'Helvetica'
        : role === 'displayItalic'
          ? 'Helvetica-Oblique'
          : role === 'uiMedium'
            ? 'Helvetica-Bold'
            : 'Helvetica';
    doc.font(fb);
    return;
  }
  doc.font(FONT[role]);
}

function fillPageBackground(doc: PDFDoc): void {
  doc.save();
  doc.rect(0, 0, PAGE_SIZE_PT, PAGE_SIZE_PT).fill(CREAM);
  doc.restore();
}

function addSquarePage(doc: PDFDoc): void {
  doc.addPage({ size: [PAGE_SIZE_PT, PAGE_SIZE_PT], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
  fillPageBackground(doc);
}

function drawDropShadowBehind(
  doc: PDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  dx: number,
  dy: number,
): void {
  doc.save();
  doc.fillOpacity(0.11);
  doc.fillColor(SHADOW);
  doc.roundedRect(x + dx, y + dy, w, h, r).fill();
  doc.restore();
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

async function toPdfImagePng(buffer: Buffer, layoutWPt: number, layoutHPt: number): Promise<Buffer> {
  const dpr = pdfImageRasterDpr();
  const maxW = Math.max(1, Math.ceil(layoutWPt * dpr));
  const maxH = Math.max(1, Math.ceil(layoutHPt * dpr));
  return sharp(buffer)
    .rotate()
    .resize(maxW, maxH, {
      fit: 'inside',
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 4, effort: 5 })
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

function computePolaroidLayout(
  iw: number,
  ih: number,
  maxImgW: number,
  maxImgH: number,
): { imgW: number; imgH: number; cardW: number; cardH: number } {
  const scale = Math.min(maxImgW / Math.max(1, iw), maxImgH / Math.max(1, ih));
  const imgW = iw * scale;
  const imgH = ih * scale;
  return {
    imgW,
    imgH,
    cardW: imgW + POLAROID_SIDE_PAD * 2,
    cardH: POLAROID_TOP_PAD + imgH + POLAROID_BOTTOM_STRIP,
  };
}

/**
 * Polaroid-style card: frame outer size follows image aspect ratio (image scaled to fit max box).
 */
async function drawPolaroidPhoto(
  doc: PDFDoc,
  fontsOk: boolean,
  slot: EntryImageSlot,
  imagePlaceholder: string,
  cx: number,
  cy: number,
  maxImgW: number,
  maxImgH: number,
  rotationDeg: number,
): Promise<void> {
  let iw: number;
  let ih: number;
  try {
    ({ iw, ih } = await intrinsicImageSizePt(slot.buffer));
  } catch {
    iw = maxImgW;
    ih = maxImgH;
  }

  const { imgW, imgH, cardW, cardH } = computePolaroidLayout(iw, ih, maxImgW, maxImgH);
  const imgX = POLAROID_SIDE_PAD;
  const imgY = POLAROID_TOP_PAD;

  try {
    const png = await toPdfImagePng(slot.buffer, imgW, imgH);

    doc.save();
    doc.translate(cx, cy);
    doc.rotate(rotationDeg);
    doc.translate(-cardW / 2, -cardH / 2);

    drawDropShadowBehind(doc, 0, 0, cardW, cardH, POLAROID_CARD_CORNER, 2.5, 3.2);

    doc.roundedRect(0, 0, cardW, cardH, POLAROID_CARD_CORNER).fill(FRAME_WHITE);

    doc.save();
    doc.roundedRect(imgX, imgY, imgW, imgH, POLAROID_IMG_CORNER).clip();
    doc.image(png, imgX, imgY, { width: imgW, height: imgH });
    doc.restore();

    doc.roundedRect(imgX, imgY, imgW, imgH, POLAROID_IMG_CORNER).strokeColor('#e8e4dc').lineWidth(0.3).stroke();
    doc.restore();
  } catch {
    doc.save();
    doc.translate(cx, cy);
    doc.rotate(rotationDeg);
    doc.translate(-cardW / 2, -cardH / 2);
    doc.roundedRect(0, 0, cardW, cardH, POLAROID_CARD_CORNER).fill(FRAME_WHITE);
    doc.roundedRect(imgX, imgY, imgW, imgH, POLAROID_IMG_CORNER).stroke('#cccccc');
    setPhotobookFont(doc, fontsOk, 'ui');
    doc.fontSize(8).fillColor(CAPTION).text(imagePlaceholder, imgX, imgY + imgH / 2 - 4, {
      width: imgW,
      align: 'center',
    });
    doc.restore();
  }
}

async function embedPolaroidImages(
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
    await drawPolaroidPhoto(doc, fontsOk, slots[0]!, imagePlaceholder, cxMid, cyMid, bandW * 0.98, bandH * 0.98, -2);
    return;
  }

  const infos = await intrinsicsForSlots(slots.slice(0, n));
  const t2: [number, number] = [-3, 3.5];
  const t3: [number, number, number] = [-2.5, 3, -2.2];
  const t4: [number, number, number, number] = [-2.5, 3.2, -2.2, 2.8];

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
      await drawPolaroidPhoto(doc, fontsOk, a.slot, imagePlaceholder, cx0, cy, colW * 0.97, bandH * 0.97, t2[0]!);
      await drawPolaroidPhoto(doc, fontsOk, b.slot, imagePlaceholder, cx1, cy, colW * 0.97, bandH * 0.97, t2[1]!);
      return;
    }

    if (bothLandscapeLike) {
      const rowH = (bandH - GAP) / 2;
      const cy0 = bandTop + rowH / 2;
      const cy1 = bandTop + rowH + GAP + rowH / 2;
      await drawPolaroidPhoto(doc, fontsOk, a.slot, imagePlaceholder, cxMid, cy0, bandW * 0.97, rowH * 0.97, t2[0]!);
      await drawPolaroidPhoto(doc, fontsOk, b.slot, imagePlaceholder, cxMid, cy1, bandW * 0.97, rowH * 0.97, t2[1]!);
      return;
    }

    const stackW = bandW * 0.58;
    const sideW = bandW - stackW - GAP;

    if (al && !bl && bp) {
      const cxL = bandLeft + stackW / 2;
      const cxR = bandLeft + stackW + GAP + sideW / 2;
      await drawPolaroidPhoto(doc, fontsOk, a.slot, imagePlaceholder, cxL, cyMid, stackW * 0.96, bandH * 0.97, t2[0]!);
      await drawPolaroidPhoto(doc, fontsOk, b.slot, imagePlaceholder, cxR, cyMid, sideW * 0.96, bandH * 0.97, t2[1]!);
      return;
    }
    if (ap && !bp && bl) {
      const cxL = bandLeft + sideW / 2;
      const cxR = bandLeft + sideW + GAP + stackW / 2;
      await drawPolaroidPhoto(doc, fontsOk, a.slot, imagePlaceholder, cxL, cyMid, sideW * 0.96, bandH * 0.97, t2[0]!);
      await drawPolaroidPhoto(doc, fontsOk, b.slot, imagePlaceholder, cxR, cyMid, stackW * 0.96, bandH * 0.97, t2[1]!);
      return;
    }
    if (bl && !al && ap) {
      const cxL = bandLeft + stackW / 2;
      const cxR = bandLeft + stackW + GAP + sideW / 2;
      await drawPolaroidPhoto(doc, fontsOk, b.slot, imagePlaceholder, cxL, cyMid, stackW * 0.96, bandH * 0.97, t2[0]!);
      await drawPolaroidPhoto(doc, fontsOk, a.slot, imagePlaceholder, cxR, cyMid, sideW * 0.96, bandH * 0.97, t2[1]!);
      return;
    }

    const cxL = bandLeft + stackW / 2;
    const cxR = bandLeft + stackW + GAP + sideW / 2;
    await drawPolaroidPhoto(doc, fontsOk, a.slot, imagePlaceholder, cxL, cyMid, stackW * 0.96, bandH * 0.97, t2[0]!);
    await drawPolaroidPhoto(doc, fontsOk, b.slot, imagePlaceholder, cxR, cyMid, sideW * 0.96, bandH * 0.97, t2[1]!);
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
        await drawPolaroidPhoto(
          doc,
          fontsOk,
          infos[i]!.slot,
          imagePlaceholder,
          cx,
          cyMid,
          colW * 0.96,
          bandH * 0.96,
          t3[i]!,
        );
      }
      return;
    }

    if (wideCount === 3) {
      const rowH = (bandH - 2 * GAP) / 3;
      for (let i = 0; i < 3; i++) {
        const cy = bandTop + rowH / 2 + i * (rowH + GAP);
        await drawPolaroidPhoto(
          doc,
          fontsOk,
          infos[i]!.slot,
          imagePlaceholder,
          cxMid,
          cy,
          bandW * 0.96,
          rowH * 0.96,
          t3[i]!,
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
      await drawPolaroidPhoto(doc, fontsOk, L1.slot, imagePlaceholder, cxL, cy0, stackW * 0.95, rowH * 0.95, t3[0]!);
      await drawPolaroidPhoto(doc, fontsOk, L2.slot, imagePlaceholder, cxL, cy1, stackW * 0.95, rowH * 0.95, t3[1]!);
      await drawPolaroidPhoto(doc, fontsOk, P.slot, imagePlaceholder, cxR, cyMid, sideW * 0.95, bandH * 0.97, t3[2]!);
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
      await drawPolaroidPhoto(doc, fontsOk, P1.slot, imagePlaceholder, cxL, cy0, sideW * 0.95, rowH * 0.95, t3[0]!);
      await drawPolaroidPhoto(doc, fontsOk, P2.slot, imagePlaceholder, cxL, cy1, sideW * 0.95, rowH * 0.95, t3[1]!);
      await drawPolaroidPhoto(doc, fontsOk, L.slot, imagePlaceholder, cxR, cyMid, stackW * 0.95, bandH * 0.97, t3[2]!);
      return;
    }

    const colW = (bandW - 2 * GAP) / 3;
    for (let i = 0; i < 3; i++) {
      const cx = bandLeft + colW / 2 + i * (colW + GAP);
      await drawPolaroidPhoto(doc, fontsOk, infos[i]!.slot, imagePlaceholder, cx, cyMid, colW * 0.94, bandH * 0.94, t3[i]!);
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
      await drawPolaroidPhoto(doc, fontsOk, infos[i]!.slot, imagePlaceholder, cx, cy, cellW * 0.96, cellH * 0.96, t4[i]!);
    }
  }
}

async function drawCoverPage(
  doc: PDFDoc,
  fontsOk: boolean,
  trip: Trip,
  entries: Entry[],
  strings: (typeof PHOTOBOOK_PDF_STRINGS)['nb'],
  intlLocale: string,
): Promise<void> {
  addSquarePage(doc);

  const keys = collectTripImageKeys(entries);
  const coverKey = pickRandomCoverKey(keys);
  let coverBuf: Buffer | null = null;
  if (coverKey) {
    coverBuf = await loadImageBufferForKey(coverKey);
  }

  const w = PAGE_SIZE_PT - 2 * MARGIN;
  let y = MARGIN + 8;

  setPhotobookFont(doc, fontsOk, 'display');
  doc.fontSize(26).fillColor(ACCENT).text(trip.name, MARGIN, y, { width: w, align: 'center' });
  y = doc.y + 10;

  const range = formatCoverDateRange(trip, intlLocale);
  if (range) {
    setPhotobookFont(doc, fontsOk, 'uiMedium');
    doc.fontSize(9).fillColor(CAPTION).text(range, MARGIN, y, { width: w, align: 'center', lineGap: 1 });
    y = doc.y + 14;
  }

  if (trip.description?.trim()) {
    setPhotobookFont(doc, fontsOk, 'ui');
    doc.fontSize(10).fillColor(BODY).text(trip.description.trim(), MARGIN, y, {
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
  const cx = PAGE_SIZE_PT / 2;
  const cy = heroTop + heroH / 2;

  if (coverBuf) {
    const fakeSlot: EntryImageSlot = {
      meta: { key: '', width: 1, height: 1, order: 0, uploadedAt: new Date(0).toISOString() },
      buffer: coverBuf,
    };
    await drawPolaroidPhoto(doc, fontsOk, fakeSlot, strings.imagePlaceholder, cx, cy, heroW * 0.92, heroH * 0.92, 0);
  } else {
    setPhotobookFont(doc, fontsOk, 'ui');
    doc.fontSize(10).fillColor(CAPTION).text(strings.coverNoPhotoHint, MARGIN, cy - 6, { width: w, align: 'center' });
  }
}

/**
 * Square photobook PDF: cream pages, embedded fonts, polaroid-style images, day prefix in header (no footer).
 */
export async function buildTripPhotobookPdf(input: TripPhotobookPdfInput): Promise<Buffer> {
  const timeZone = input.timeZone ?? process.env['TRIP_PDF_TIMEZONE'] ?? 'UTC';
  const localeKey =
    input.photobookLocaleKey ??
    resolvePhotobookPdfLocaleKey(process.env['TRIP_PDF_LOCALE'] ?? 'nb');
  const strings = PHOTOBOOK_PDF_STRINGS[localeKey];
  const intlLocale = photobookPdfIntlLocale(localeKey);

  const byDay = groupEntriesByDay(input.entries, timeZone);
  const dayKeys = [...byDay.keys()].sort();

  const doc = new PDFDocument({
    size: [PAGE_SIZE_PT, PAGE_SIZE_PT],
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: false,
  });

  const fontsOk = registerPhotobookFonts(doc);

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  await drawCoverPage(doc, fontsOk, input.trip, input.entries, strings, intlLocale);

  const innerBottom = pageContentBottom();

  if (dayKeys.length === 0) {
    addSquarePage(doc);
    setPhotobookFont(doc, fontsOk, 'display');
    doc.fontSize(13).fillColor(BODY).text(strings.emptyTripDisclaimer, MARGIN, MARGIN, {
      width: PAGE_SIZE_PT - 2 * MARGIN,
      align: 'center',
    });
    doc.end();
    return done;
  }

  for (let d = 0; d < dayKeys.length; d++) {
    const dayNum = d + 1;
    const entries = byDay.get(dayKeys[d]!)!;
    const firstCreated = entries[0]!.createdAt;
    const dayDatePart = formatEntryPageDate(firstCreated, timeZone, intlLocale);

    for (const entry of entries) {
      const imageSlots = await loadEntryImageSlots(entry);
      const imagePageCount =
        imageSlots.length === 0 ? 1 : Math.ceil(imageSlots.length / MAX_IMAGES_PER_PAGE);

      for (let p = 0; p < imagePageCount; p++) {
        addSquarePage(doc);

        const top = MARGIN + 4;
        let y = top;

        const headerLine = formatPhotobookFooterDayDate(strings.entryPageHeaderTemplate, dayNum, dayDatePart);
        setPhotobookFont(doc, fontsOk, 'uiMedium');
        doc.fontSize(8).fillColor(CAPTION).text(headerLine, MARGIN, y, {
          width: PAGE_SIZE_PT - 2 * MARGIN,
        });
        y = doc.y + (p === 0 ? 8 : 10);

        if (p === 0) {
          setPhotobookFont(doc, fontsOk, 'displayItalic');
          doc.fontSize(17).fillColor(ACCENT).text(entry.title, MARGIN, y, {
            width: PAGE_SIZE_PT - 2 * MARGIN,
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
        const imageBandH =
          slice.length > 0 ? Math.max(48, innerBottom - bandTop - textReservePt) : 0;

        if (slice.length > 0) {
          const bandLeft = MARGIN;
          const bandW = PAGE_SIZE_PT - 2 * MARGIN;
          await embedPolaroidImages(
            doc,
            fontsOk,
            slice,
            strings.imagePlaceholder,
            bandLeft,
            bandTop,
            bandW,
            imageBandH,
          );
        } else if (p === 0) {
          setPhotobookFont(doc, fontsOk, 'displayItalic');
          doc.fontSize(10).fillColor(BODY).text(entry.content, MARGIN, y, {
            width: PAGE_SIZE_PT - 2 * MARGIN,
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
            .moveTo(MARGIN + 28, sepY)
            .lineTo(PAGE_SIZE_PT - MARGIN - 28, sepY)
            .stroke();
          doc.restore();

          const bodyY = sepY + 10;
          setPhotobookFont(doc, fontsOk, 'displayItalic');
          doc.fontSize(9).fillColor(BODY).text(entry.content, MARGIN, bodyY, {
            width: PAGE_SIZE_PT - 2 * MARGIN,
            height: innerBottom - bodyY - 4,
            align: 'center',
            lineGap: 3,
          });
        }
      }
    }
  }

  doc.end();
  return done;
}
