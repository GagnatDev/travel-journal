/** Long calendar date for the entry composer metadata row (matches timeline-style grouping). */
export const COMPOSER_ENTRY_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

export function formatComposerEntryDate(
  isoOrMs: string | number,
  language: string,
): string {
  const d = new Date(isoOrMs);
  return d.toLocaleDateString(language, COMPOSER_ENTRY_DATE_FORMAT);
}
