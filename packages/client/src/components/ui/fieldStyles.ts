export type TextFieldVariant = 'standard' | 'entry';

/** Standard control chrome without width (use inside flex rows with `flex-1 min-w-0`). */
export const standardTextControlClass =
  'px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent';

/** Shared full-width inputs (border + focus ring). min-w-0/max-w-full keep type="date" from overflowing narrow containers. */
export const standardTextFieldClass = `w-full min-w-0 max-w-full ${standardTextControlClass}`;

/** Entry editor fields (softer border, accent focus). */
export const entryTextControlClass =
  'px-3 py-2 bg-bg-secondary border border-caption/30 rounded-round-eight font-ui text-body focus:outline-none focus:border-accent';

export const entryTextFieldClass = `w-full min-w-0 max-w-full ${entryTextControlClass}`;
