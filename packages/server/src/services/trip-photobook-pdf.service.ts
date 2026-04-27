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

import { getObjectBuffer } from './media.service.js';

type PDFDoc = InstanceType<typeof PDFDocument>;

const MM = 72 / 25.4;
const PAGE_SIZE_PT = 210 * MM;
/** 10 mm clear margin on all edges */
const MARGIN = 10 * MM;
/** Vertical space reserved for footer line inside bottom margin */
const FOOTER_BAND = 5 * MM;
const GAP = 2 * MM;
const MAX_IMAGES_PER_PAGE = 4;

/** Rasterize images at this multiple of layout cell size (points → pixels) for sharper PDFs. */
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

function formatTripDate(iso: string | undefined, intlLocale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export interface TripPhotobookPdfInput {
  trip: Trip;
  entries: Entry[];
  /** IANA zone for grouping and footer dates; default UTC. */
  timeZone?: string;
  /** PDF UI strings: `nb` (default) or `en`. */
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

function drawFooter(doc: PDFDoc, strings: (typeof PHOTOBOOK_PDF_STRINGS)['nb'], dayNum: number, dateLabel: string): void {
  doc.save();
  doc.fontSize(9).fillColor('#444444');
  const line = formatPhotobookFooterDayDate(strings.footerDayDateTemplate, dayNum, dateLabel);
  doc.text(line, MARGIN, footerTextY(), {
    width: PAGE_SIZE_PT - 2 * MARGIN,
    align: 'center',
    lineBreak: false,
  });
  doc.restore();
  doc.fillColor('#000000');
}

function addSquarePage(doc: PDFDoc): void {
  doc.addPage({ size: [PAGE_SIZE_PT, PAGE_SIZE_PT], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
}

function drawCoverPage(
  doc: PDFDoc,
  trip: Trip,
  strings: (typeof PHOTOBOOK_PDF_STRINGS)['nb'],
  intlLocale: string,
): void {
  addSquarePage(doc);
  let y = MARGIN;
  doc.fontSize(22).fillColor('#111111').text(trip.name, MARGIN, y, { width: PAGE_SIZE_PT - 2 * MARGIN });
  y = doc.y + GAP * 1.5;

  if (trip.description?.trim()) {
    doc.fontSize(11).fillColor('#333333').text(trip.description.trim(), MARGIN, y, {
      width: PAGE_SIZE_PT - 2 * MARGIN,
      height: Math.max(40, pageInnerBottom() - y - 28 * MM),
    });
    y = doc.y + GAP * 1.5;
  }

  const dep = formatTripDate(trip.departureDate, intlLocale);
  const ret = formatTripDate(trip.returnDate, intlLocale);
  doc.fontSize(10).fillColor('#444444');
  doc.text(
    `${strings.coverDepartureLabel}: ${dep || strings.coverDateMissing}`,
    MARGIN,
    y,
    { width: PAGE_SIZE_PT - 2 * MARGIN },
  );
  y = doc.y + GAP;
  doc.text(`${strings.coverReturnLabel}: ${ret || strings.coverDateMissing}`, MARGIN, y, {
    width: PAGE_SIZE_PT - 2 * MARGIN,
  });
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
          // skip missing
        }
      }
    }
  }
  return out;
}

/** PDFKit embeds PNG reliably; decode full-res bytes then rasterize for on-screen sharpness at draw size. */
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

async function embedImageGrid(
  doc: PDFDoc,
  slots: EntryImageSlot[],
  imagePlaceholder: string,
  startX: number,
  startY: number,
  maxWidth: number,
  maxHeight: number,
): Promise<void> {
  const n = Math.min(slots.length, MAX_IMAGES_PER_PAGE);
  if (n === 0) return;

  const cols = n <= 2 ? n : 2;
  const rows = Math.ceil(n / cols);
  const cellW = (maxWidth - (cols - 1) * GAP) / cols;
  const cellH = (maxHeight - (rows - 1) * GAP) / rows;

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellLeft = startX + col * (cellW + GAP);
    const cellTop = startY + row * (cellH + GAP);
    const slot = slots[i]!;
    try {
      const png = await toPdfImagePng(slot.buffer, cellW, cellH);
      const meta = await sharp(png).metadata();
      const iw = meta.width ?? 1;
      const ih = meta.height ?? 1;
      const scale = Math.min(cellW / iw, cellH / ih);
      const drawW = iw * scale;
      const drawH = ih * scale;
      const x = cellLeft + (cellW - drawW) / 2;
      const y = cellTop + (cellH - drawH) / 2;
      doc.image(png, x, y, { width: drawW, height: drawH });
    } catch {
      doc.rect(cellLeft, cellTop, cellW, cellH).stroke('#cccccc');
      doc
        .fontSize(8)
        .fillColor('#888888')
        .text(imagePlaceholder, cellLeft, cellTop + cellH / 2 - 4, { width: cellW, align: 'center' });
      doc.fillColor('#000000');
    }
  }
}

/**
 * Square (210×210 mm) photobook PDF: cover (title, description, dates), then entries by day,
 * up to four images per page (aspect-preserving), footer on same page as content, 10 mm margins.
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

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawCoverPage(doc, input.trip, strings, intlLocale);

  if (dayKeys.length === 0) {
    addSquarePage(doc);
    doc.fontSize(12).fillColor('#666666').text(strings.emptyTripDisclaimer, MARGIN, MARGIN, {
      width: PAGE_SIZE_PT - 2 * MARGIN,
    });
    drawFooter(doc, strings, 1, strings.emptyTripFooterPlaceholder);
    doc.end();
    return done;
  }

  const innerBottom = pageInnerBottom();

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

        const top = MARGIN;
        let y = top;

        doc.fontSize(16).fillColor('#111111').text(entry.title, MARGIN, y, {
          width: PAGE_SIZE_PT - 2 * MARGIN,
        });
        y = doc.y + GAP;

        const slice = imageSlots.slice(p * MAX_IMAGES_PER_PAGE, (p + 1) * MAX_IMAGES_PER_PAGE);
        const minImageBand = slice.length > 0 ? 52 * MM : 0;
        const maxTextBottom = innerBottom - minImageBand - GAP;

        if (p === 0) {
          const textHeight = Math.max(36, maxTextBottom - y);
          doc.fontSize(10).fillColor('#333333').text(entry.content, MARGIN, y, {
            width: PAGE_SIZE_PT - 2 * MARGIN,
            height: textHeight,
          });
          y = Math.min(doc.y + GAP, maxTextBottom + GAP);
        } else {
          doc.fontSize(9).fillColor('#666666').font('Helvetica-Oblique').text(strings.morePhotosCaption, MARGIN, y, {
            width: PAGE_SIZE_PT - 2 * MARGIN,
          });
          doc.font('Helvetica');
          y = doc.y + GAP;
        }

        if (slice.length > 0) {
          const gridTop = Math.min(y, maxTextBottom + GAP);
          const gridH = Math.max(40, innerBottom - gridTop - GAP);
          const gridW = PAGE_SIZE_PT - 2 * MARGIN;
          await embedImageGrid(doc, slice, strings.imagePlaceholder, MARGIN, gridTop, gridW, gridH);
        }

        drawFooter(doc, strings, dayNum, footerDate);
      }
    }
  }

  doc.end();
  return done;
}
