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
const FOOTER_BAND = 5 * MM;
const GAP = 2 * MM;
const MAX_IMAGES_PER_PAGE = 4;

/** Light theme (matches packages/client/src/styles/tokens.css :root) */
const CREAM = '#fbf9f5';
const ACCENT = '#9b3f2b';
const HEADING = '#1b1c1a';
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

function pageInnerBottom(): number {
  return PAGE_SIZE_PT - MARGIN - FOOTER_BAND;
}

function footerTextY(): number {
  return PAGE_SIZE_PT - MARGIN - FOOTER_BAND + 1;
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

function formatFooterDate(iso: string, timeZone: string, intlLocale: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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
    // Omit `family`: passing a name makes fontkit treat the file as a variable-font lookup and can throw on subset WOFF.
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

function drawFooter(
  doc: PDFDoc,
  fontsOk: boolean,
  strings: (typeof PHOTOBOOK_PDF_STRINGS)['nb'],
  dayNum: number,
  dateLabel: string,
): void {
  doc.save();
  setPhotobookFont(doc, fontsOk, 'ui');
  doc.fontSize(8).fillColor(CAPTION);
  const line = formatPhotobookFooterDayDate(strings.footerDayDateTemplate, dayNum, dateLabel);
  doc.text(line, MARGIN, footerTextY(), {
    width: PAGE_SIZE_PT - 2 * MARGIN,
    align: 'center',
    lineBreak: false,
  });
  doc.restore();
  doc.fillColor(HEADING);
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
  doc.fillOpacity(0.12);
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

/** White mat + optional shadow + rounded photo clip */
async function drawFramedPhoto(
  doc: PDFDoc,
  fontsOk: boolean,
  slot: EntryImageSlot,
  imagePlaceholder: string,
  cx: number,
  cy: number,
  targetW: number,
  targetH: number,
  rotationDeg: number,
  pad: number,
  cornerR: number,
): Promise<void> {
  const matW = targetW + pad * 2;
  const matH = targetH + pad * 2;
  const x = cx - matW / 2;
  const y = cy - matH / 2;

  drawDropShadowBehind(doc, x, y, matW, matH, cornerR, 2.5, 3);

  const innerW = targetW;
  const innerH = targetH;

  try {
    const png = await toPdfImagePng(slot.buffer, innerW, innerH);
    const meta = await sharp(png).metadata();
    const iw = meta.width ?? 1;
    const ih = meta.height ?? 1;
    const scale = Math.min(innerW / iw, innerH / ih);
    const drawW = iw * scale;
    const drawH = ih * scale;
    const imgX = (innerW - drawW) / 2;
    const imgY = (innerH - drawH) / 2;

    doc.save();
    doc.translate(cx, cy);
    doc.rotate(rotationDeg);
    doc.translate(-matW / 2, -matH / 2);
    doc.roundedRect(0, 0, matW, matH, cornerR).fill(FRAME_WHITE);
    doc.save();
    doc.translate(pad, pad);
    doc.roundedRect(0, 0, innerW, innerH, cornerR * 0.65).clip();
    doc.image(png, imgX, imgY, { width: drawW, height: drawH });
    doc.restore();
    doc.save();
    doc.translate(pad, pad);
    doc.roundedRect(0, 0, innerW, innerH, cornerR * 0.65).strokeColor('#e8e4dc').lineWidth(0.35).stroke();
    doc.restore();
    doc.restore();
  } catch {
    doc.save();
    doc.translate(cx, cy);
    doc.rotate(rotationDeg);
    doc.translate(-matW / 2, -matH / 2);
    doc.roundedRect(0, 0, matW, matH, cornerR).fill(FRAME_WHITE);
    doc.save();
    doc.translate(pad, pad);
    doc.roundedRect(0, 0, innerW, innerH, cornerR * 0.65).stroke('#cccccc');
    setPhotobookFont(doc, fontsOk, 'ui');
    doc.fontSize(8).fillColor(CAPTION).text(imagePlaceholder, 0, innerH / 2 - 4, {
      width: innerW,
      align: 'center',
    });
    doc.restore();
    doc.restore();
  }
}

async function embedScrapbookImages(
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

  const pad = 4;
  const cornerR = 6;

  if (n === 1) {
    const tw = Math.min(bandW * 0.72, bandH * 0.95);
    const th = Math.min(bandH * 0.72, tw * 0.85);
    await drawFramedPhoto(doc, fontsOk, slots[0]!, imagePlaceholder, centerX, centerY, tw, th, -2.5, pad, cornerR);
    return;
  }

  if (n === 2) {
    const w1 = bandW * 0.52;
    const h1 = bandH * 0.58;
    const w2 = bandW * 0.34;
    const h2 = bandH * 0.42;
    const cx1 = centerX - bandW * 0.08;
    const cy1 = centerY + bandH * 0.02;
    const cx2 = centerX + bandW * 0.22;
    const cy2 = centerY - bandH * 0.12;
    await drawFramedPhoto(doc, fontsOk, slots[0]!, imagePlaceholder, cx1, cy1, w1, h1, -4, pad, cornerR);
    await drawFramedPhoto(doc, fontsOk, slots[1]!, imagePlaceholder, cx2, cy2, w2, h2, 5, pad, cornerR);
    return;
  }

  const cols = n <= 2 ? n : 2;
  const rows = Math.ceil(n / cols);
  const cellW = (bandW - (cols - 1) * GAP) / cols;
  const cellH = (bandH - (rows - 1) * GAP) / rows;
  const startX = centerX - bandW / 2;
  const startY = centerY - bandH / 2;
  const tilts = [-2.5, 3, -2, 2.5];

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellLeft = startX + col * (cellW + GAP);
    const cellTop = startY + row * (cellH + GAP);
    const cx = cellLeft + cellW / 2;
    const cy = cellTop + cellH / 2;
    const tw = cellW * 0.88;
    const th = cellH * 0.88;
    await drawFramedPhoto(doc, fontsOk, slots[i]!, imagePlaceholder, cx, cy, tw, th, tilts[i % tilts.length]!, pad, cornerR);
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
  const heroBottom = pageInnerBottom() - 8;
  const heroH = Math.max(80, heroBottom - heroTop);
  const heroW = Math.min(w * 0.88, heroH * 1.05);
  const cx = PAGE_SIZE_PT / 2;
  const cy = heroTop + heroH / 2;

  if (coverBuf) {
    const matPad = 10;
    const cornerR = 10;
    const tw = heroW - matPad * 2;
    const th = heroH - matPad * 2;
    const fakeSlot: EntryImageSlot = {
      meta: { key: '', width: 1, height: 1, order: 0, uploadedAt: new Date(0).toISOString() },
      buffer: coverBuf,
    };
    await drawFramedPhoto(doc, fontsOk, fakeSlot, strings.imagePlaceholder, cx, cy, tw, th, 0, matPad, cornerR);
  } else {
    setPhotobookFont(doc, fontsOk, 'ui');
    doc.fontSize(10).fillColor(CAPTION).text(strings.coverNoPhotoHint, MARGIN, cy - 6, { width: w, align: 'center' });
  }
}

/**
 * Square photobook PDF: cream pages, embedded Noto Serif + Plus Jakarta Sans,
 * cover with random trip photo, scrapbook-style framed images on content pages.
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

  if (dayKeys.length === 0) {
    addSquarePage(doc);
    setPhotobookFont(doc, fontsOk, 'display');
    doc.fontSize(13).fillColor(BODY).text(strings.emptyTripDisclaimer, MARGIN, MARGIN, {
      width: PAGE_SIZE_PT - 2 * MARGIN,
      align: 'center',
    });
    drawFooter(doc, fontsOk, strings, 1, strings.emptyTripFooterPlaceholder);
    doc.end();
    return done;
  }

  const innerBottom = pageInnerBottom();
  const centerX = PAGE_SIZE_PT / 2;

  for (let d = 0; d < dayKeys.length; d++) {
    const dayNum = d + 1;
    const entries = byDay.get(dayKeys[d]!)!;
    const firstCreated = entries[0]!.createdAt;
    const footerDate = formatFooterDate(firstCreated, timeZone, intlLocale);

    for (const entry of entries) {
      const imageSlots = await loadEntryImageSlots(entry);
      const imagePageCount =
        imageSlots.length === 0 ? 1 : Math.ceil(imageSlots.length / MAX_IMAGES_PER_PAGE);

      for (let p = 0; p < imagePageCount; p++) {
        addSquarePage(doc);

        const top = MARGIN + 4;
        let y = top;

        const dateLine = formatEntryPageDate(entry.createdAt, timeZone, intlLocale);
        setPhotobookFont(doc, fontsOk, 'uiMedium');
        doc.fontSize(8).fillColor(CAPTION).text(dateLine, MARGIN, y, {
          width: PAGE_SIZE_PT - 2 * MARGIN,
        });
        y = doc.y + 4;

        setPhotobookFont(doc, fontsOk, 'displayItalic');
        doc.fontSize(17).fillColor(ACCENT).text(entry.title, MARGIN, y, {
          width: PAGE_SIZE_PT - 2 * MARGIN,
        });
        y = doc.y + 10;

        const slice = imageSlots.slice(p * MAX_IMAGES_PER_PAGE, (p + 1) * MAX_IMAGES_PER_PAGE);
        const imageBandH =
          slice.length > 0 ? Math.min(92 * MM, innerBottom - y - 42 * MM) : 0;

        if (slice.length > 0) {
          const bandTop = y + 4;
          const bandCenterY = bandTop + imageBandH / 2;
          await embedScrapbookImages(
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
            height: innerBottom - y - FOOTER_BAND,
            align: 'center',
            lineGap: 3,
          });
        } else {
          setPhotobookFont(doc, fontsOk, 'ui');
          doc.fontSize(9).fillColor(CAPTION).text(strings.morePhotosCaption, MARGIN, y, {
            width: PAGE_SIZE_PT - 2 * MARGIN,
            align: 'center',
          });
        }

        if (slice.length > 0) {
          const sepY = innerBottom - 36 * MM;
          doc.save();
          doc.strokeColor('#e0d8cc')
            .lineWidth(0.35)
            .moveTo(MARGIN + 28, sepY)
            .lineTo(PAGE_SIZE_PT - MARGIN - 28, sepY)
            .stroke();
          doc.restore();

          const bodyY = sepY + 10;
          const bodyMaxH = footerTextY() - bodyY - 4;
          if (p === 0) {
            setPhotobookFont(doc, fontsOk, 'displayItalic');
            doc.fontSize(9).fillColor(BODY).text(entry.content, MARGIN, bodyY, {
              width: PAGE_SIZE_PT - 2 * MARGIN,
              height: Math.max(24, bodyMaxH),
              align: 'center',
              lineGap: 3,
            });
          } else {
            setPhotobookFont(doc, fontsOk, 'displayItalic');
            doc.fontSize(8).fillColor(CAPTION).text(strings.morePhotosCaption, MARGIN, bodyY, {
              width: PAGE_SIZE_PT - 2 * MARGIN,
              height: bodyMaxH,
              align: 'center',
            });
          }
        }

        drawFooter(doc, fontsOk, strings, dayNum, footerDate);
      }
    }
  }

  doc.end();
  return done;
}
