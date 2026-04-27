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

/** Polaroid-style card: white bottom strip + side padding (points). */
const POLAROID_SIDE_PAD = 10;
const POLAROID_TOP_PAD = 8;
const POLAROID_BOTTOM_STRIP = 20;
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
  if (raw === undefined || raw === '') return 2;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, n));
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
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 6, effort: 4 })
    .toBuffer();
}

async function intrinsicImageSizePt(buffer: Buffer): Promise<{ iw: number; ih: number }> {
  const meta = await sharp(buffer).rotate().metadata();
  const iw = Math.max(1, meta.width ?? 1);
  const ih = Math.max(1, meta.height ?? 1);
  return { iw, ih };
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

  const scale = Math.min(maxImgW / iw, maxImgH / ih, 1);
  const imgW = iw * scale;
  const imgH = ih * scale;
  const cardW = imgW + POLAROID_SIDE_PAD * 2;
  const cardH = POLAROID_TOP_PAD + imgH + POLAROID_BOTTOM_STRIP;
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
  centerX: number,
  centerY: number,
  bandW: number,
  bandH: number,
): Promise<void> {
  const n = Math.min(slots.length, MAX_IMAGES_PER_PAGE);
  if (n === 0) return;

  if (n === 1) {
    const maxW = bandW * 0.82;
    const maxH = bandH * 0.92;
    await drawPolaroidPhoto(doc, fontsOk, slots[0]!, imagePlaceholder, centerX, centerY, maxW, maxH, -2.5);
    return;
  }

  if (n === 2) {
    const maxW1 = bandW * 0.48;
    const maxH1 = bandH * 0.78;
    const maxW2 = bandW * 0.38;
    const maxH2 = bandH * 0.55;
    const cx1 = centerX - bandW * 0.14;
    const cy1 = centerY + bandH * 0.06;
    const cx2 = centerX + bandW * 0.2;
    const cy2 = centerY - bandH * 0.1;
    await drawPolaroidPhoto(doc, fontsOk, slots[0]!, imagePlaceholder, cx1, cy1, maxW1, maxH1, -3.5);
    await drawPolaroidPhoto(doc, fontsOk, slots[1]!, imagePlaceholder, cx2, cy2, maxW2, maxH2, 4.5);
    return;
  }

  const cols = 2;
  const rows = Math.ceil(n / cols);
  const cellW = (bandW - (cols - 1) * GAP) / cols;
  const cellH = (bandH - (rows - 1) * GAP) / rows;
  const startX = centerX - bandW / 2;
  const startY = centerY - bandH / 2;
  const tilts = [-2.5, 3.2, -2.2, 2.8];
  const maxInCellW = cellW * 0.92;
  const maxInCellH = cellH * 0.92;

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = startX + col * (cellW + GAP) + cellW / 2;
    const cy = startY + row * (cellH + GAP) + cellH / 2;
    await drawPolaroidPhoto(doc, fontsOk, slots[i]!, imagePlaceholder, cx, cy, maxInCellW, maxInCellH, tilts[i % tilts.length]!);
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

  const centerX = PAGE_SIZE_PT / 2;

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
        const imageBandH =
          slice.length > 0 ? Math.min(100 * MM, innerBottom - y - (p === 0 ? 40 * MM : 8 * MM)) : 0;

        if (slice.length > 0) {
          const bandTop = y + 4;
          const bandCenterY = bandTop + imageBandH / 2;
          await embedPolaroidImages(
            doc,
            fontsOk,
            slice,
            strings.imagePlaceholder,
            centerX,
            bandCenterY,
            PAGE_SIZE_PT - 2 * MARGIN,
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

        if (slice.length > 0 && p === 0) {
          const sepY = innerBottom - 34 * MM;
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
