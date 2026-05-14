import type PDFDocument from 'pdfkit';

import { logger } from '../logger.js';
import { resolvePhotobookFontPaths } from './trip-photobook-fonts.js';

type PDFDoc = InstanceType<typeof PDFDocument>;

const FONT = {
  display: 'PhotobookDisplay',
  displayItalic: 'PhotobookDisplayItalic',
  ui: 'PhotobookUI',
  uiMedium: 'PhotobookUIMedium',
} as const;

export type PhotobookPdfFontRole = 'display' | 'displayItalic' | 'ui' | 'uiMedium';

export function registerPhotobookFonts(doc: PDFDoc): boolean {
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

export function setPhotobookFont(doc: PDFDoc, fontsOk: boolean, role: PhotobookPdfFontRole): void {
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
