import PDFDocument from 'pdfkit';
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
const MARGIN = 12 * MM;
const FOOTER_HEIGHT = 10 * MM;
const GAP = 2 * MM;
const MAX_IMAGES_PER_PAGE = 4;

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
  const y = PAGE_SIZE_PT - MARGIN - 4;
  doc.fontSize(9).fillColor('#444444');
  const line = formatPhotobookFooterDayDate(strings.footerDayDateTemplate, dayNum, dateLabel);
  doc.text(line, MARGIN, y, {
    width: PAGE_SIZE_PT - 2 * MARGIN,
    align: 'center',
  });
  doc.fillColor('#000000');
}

function contentBottom(): number {
  return PAGE_SIZE_PT - MARGIN - FOOTER_HEIGHT;
}

async function embedImageGrid(
  doc: PDFDoc,
  buffers: Buffer[],
  imagePlaceholder: string,
  startX: number,
  startY: number,
  maxWidth: number,
  maxHeight: number,
): Promise<void> {
  const n = Math.min(buffers.length, MAX_IMAGES_PER_PAGE);
  if (n === 0) return;

  const cols = n <= 2 ? n : 2;
  const rows = Math.ceil(n / cols);
  const cellW = (maxWidth - (cols - 1) * GAP) / cols;
  const cellH = (maxHeight - (rows - 1) * GAP) / rows;

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cellW + GAP);
    const y = startY + row * (cellH + GAP);
    try {
      doc.image(buffers[i]!, x, y, { fit: [cellW, cellH], align: 'center', valign: 'center' });
    } catch {
      doc.rect(x, y, cellW, cellH).stroke('#cccccc');
      doc
        .fontSize(8)
        .fillColor('#888888')
        .text(imagePlaceholder, x, y + cellH / 2 - 4, { width: cellW, align: 'center' });
      doc.fillColor('#000000');
    }
  }
}

async function loadImageBuffers(entry: Entry): Promise<Buffer[]> {
  const imgs = sortedImages(entry.images);
  const out: Buffer[] = [];
  for (const img of imgs) {
    const key = img.thumbnailKey ?? img.key;
    try {
      out.push(await getObjectBuffer(key));
    } catch {
      try {
        if (img.thumbnailKey) out.push(await getObjectBuffer(img.key));
      } catch {
        // skip missing
      }
    }
  }
  return out;
}

/**
 * Builds a square (210×210 mm) photobook-style PDF: entries grouped by calendar day,
 * title and body on the first page of each entry (and on photo-only continuation pages,
 * title plus a short “more photos” line), up to four images per page, localized footer.
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

  if (dayKeys.length === 0) {
    doc.addPage({ size: [PAGE_SIZE_PT, PAGE_SIZE_PT], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
    doc.fontSize(14).text(input.trip.name, MARGIN, MARGIN, { width: PAGE_SIZE_PT - 2 * MARGIN });
    doc.moveDown(0.5).fontSize(10).fillColor('#666666').text(strings.emptyTripDisclaimer, {
      width: PAGE_SIZE_PT - 2 * MARGIN,
    });
    drawFooter(doc, strings, 1, strings.emptyTripFooterPlaceholder);
    doc.end();
    return done;
  }

  for (let d = 0; d < dayKeys.length; d++) {
    const dayKey = dayKeys[d]!;
    const dayNum = d + 1;
    const entries = byDay.get(dayKey)!;
    const firstCreated = entries[0]!.createdAt;
    const footerDate = formatFooterDate(firstCreated, timeZone, intlLocale);

    for (const entry of entries) {
      const imageBuffers = await loadImageBuffers(entry);
      const imagePageCount =
        imageBuffers.length === 0 ? 1 : Math.ceil(imageBuffers.length / MAX_IMAGES_PER_PAGE);

      for (let p = 0; p < imagePageCount; p++) {
        doc.addPage({ size: [PAGE_SIZE_PT, PAGE_SIZE_PT], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });

        const top = MARGIN;
        const bottom = contentBottom();
        let y = top;

        doc.fontSize(16).fillColor('#111111').text(entry.title, MARGIN, y, {
          width: PAGE_SIZE_PT - 2 * MARGIN,
        });
        y = doc.y + GAP;

        if (p === 0) {
          const hasImagesThisPage = imageBuffers.length > p * MAX_IMAGES_PER_PAGE;
          const reserveForImages = hasImagesThisPage ? 90 * MM : 4 * MM;
          doc.fontSize(10).fillColor('#333333').text(entry.content, MARGIN, y, {
            width: PAGE_SIZE_PT - 2 * MARGIN,
            height: Math.max(48, bottom - y - reserveForImages - GAP),
          });
          y = doc.y + GAP;
        } else {
          doc.fontSize(9).fillColor('#666666').font('Helvetica-Oblique').text(strings.morePhotosCaption, MARGIN, y, {
            width: PAGE_SIZE_PT - 2 * MARGIN,
          });
          doc.font('Helvetica');
          y = doc.y + GAP;
        }

        const slice = imageBuffers.slice(p * MAX_IMAGES_PER_PAGE, (p + 1) * MAX_IMAGES_PER_PAGE);
        if (slice.length > 0) {
          const gridH = Math.max(50 * MM, bottom - y - GAP);
          const gridW = PAGE_SIZE_PT - 2 * MARGIN;
          await embedImageGrid(doc, slice, strings.imagePlaceholder, MARGIN, y, gridW, gridH);
        }

        drawFooter(doc, strings, dayNum, footerDate);
      }
    }
  }

  doc.end();
  return done;
}
