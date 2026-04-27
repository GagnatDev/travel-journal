/**
 * UI copy for trip photobook PDFs (server-rendered). Keep keys in sync with PDF generator.
 * Locales: `nb` (default product language), `en`.
 */
export type PhotobookPdfLocaleKey = 'nb' | 'en';

export interface PhotobookPdfStrings {
  emptyTripDisclaimer: string;
  /** Footer date segment when the trip has no entries */
  emptyTripFooterPlaceholder: string;
  /** Use {{day}} and {{date}} (no guillemets — plain footer line). */
  footerDayDateTemplate: string;
  morePhotosCaption: string;
  imagePlaceholder: string;
  /** Cover page — optional trip dates */
  coverDepartureLabel: string;
  coverReturnLabel: string;
  coverDateMissing: string;
}

/** BCP 47 for {@link Intl.DateTimeFormat} (footer dates) */
export type PhotobookPdfIntlLocale = 'nb-NO' | 'en-GB';

export const PHOTOBOOK_PDF_STRINGS: Record<PhotobookPdfLocaleKey, PhotobookPdfStrings> = {
  nb: {
    emptyTripDisclaimer: 'Ingen innlegg ennå.',
    emptyTripFooterPlaceholder: '—',
    footerDayDateTemplate: 'Dag {{day}} - {{date}}',
    morePhotosCaption: 'Flere bilder',
    imagePlaceholder: 'Bilde',
    coverDepartureLabel: 'Avreise',
    coverReturnLabel: 'Hjemkomst',
    coverDateMissing: 'Ikke angitt',
  },
  en: {
    emptyTripDisclaimer: 'No entries yet.',
    emptyTripFooterPlaceholder: '—',
    footerDayDateTemplate: 'Day {{day}} - {{date}}',
    morePhotosCaption: 'More photos',
    imagePlaceholder: 'Image',
    coverDepartureLabel: 'Departure',
    coverReturnLabel: 'Return',
    coverDateMissing: 'Not set',
  },
};

export function photobookPdfIntlLocale(key: PhotobookPdfLocaleKey): PhotobookPdfIntlLocale {
  return key === 'nb' ? 'nb-NO' : 'en-GB';
}

/**
 * Map query/env/browser locale to PDF string catalog.
 * Unknown values fall back to Norwegian (`nb`).
 */
export function resolvePhotobookPdfLocaleKey(input: string | undefined): PhotobookPdfLocaleKey {
  if (!input || typeof input !== 'string') return 'nb';
  const lower = input.trim().toLowerCase();
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  if (lower === 'nb' || lower.startsWith('nb')) return 'nb';
  return 'nb';
}

export function formatPhotobookFooterDayDate(template: string, day: number, date: string): string {
  return template.replaceAll('{{day}}', String(day)).replaceAll('{{date}}', date);
}
