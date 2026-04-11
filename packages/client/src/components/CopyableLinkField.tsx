import type { ReactNode } from 'react';

import { useCopyFeedback } from '../hooks/useCopyFeedback.js';

export interface CopyableLinkFieldProps {
  /** Full URL (or any string) shown in the field and passed to the clipboard. */
  value: string;
  copyLabel: string;
  copiedLabel: string;
  /** Shown on the copy button after `navigator.clipboard.writeText` rejects. */
  errorLabel: string;
  /** Optional caption rendered as a `<label>` above the input row. */
  fieldLabel?: ReactNode;
  /** Optional description rendered as a paragraph above the input row. */
  description?: ReactNode;
  inputAriaLabel: string;
  /** Defaults to `copyLabel` when omitted. */
  copyButtonAriaLabel?: string;
  durationMs?: number;
  className?: string;
}

export function CopyableLinkField({
  value,
  copyLabel,
  copiedLabel,
  errorLabel,
  fieldLabel,
  description,
  inputAriaLabel,
  copyButtonAriaLabel,
  durationMs,
  className = 'p-3 bg-bg-secondary rounded-round-eight space-y-2',
}: CopyableLinkFieldProps) {
  const { copied, copyFailed, copyToClipboard } = useCopyFeedback(durationMs);

  return (
    <div className={className}>
      {fieldLabel != null ? (
        <label className="block font-ui text-xs font-medium text-caption">{fieldLabel}</label>
      ) : null}
      {description != null ? (
        <p className="font-ui text-xs text-caption">{description}</p>
      ) : null}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          readOnly
          aria-label={inputAriaLabel}
          className="flex-1 px-2 py-1 border border-caption rounded font-ui text-xs text-body bg-bg-primary"
        />
        <button
          type="button"
          onClick={() => void copyToClipboard(value)}
          aria-label={copyButtonAriaLabel ?? copyLabel}
          className="px-3 py-1 border border-accent text-accent font-ui text-xs font-semibold rounded hover:bg-accent hover:text-white transition-all"
        >
          {copyFailed ? errorLabel : copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}
