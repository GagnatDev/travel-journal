import type { InputHTMLAttributes, ReactNode } from 'react';

import {
  entryTextFieldClass,
  standardTextFieldClass,
  type TextFieldVariant,
} from './fieldStyles.js';

export type { TextFieldVariant };

const VARIANT_CLASS: Record<TextFieldVariant, string> = {
  standard: standardTextFieldClass,
  entry: entryTextFieldClass,
};

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: ReactNode;
  labelHtmlFor: string;
  /** Shown below the field when set. */
  error?: string | undefined;
  errorId?: string;
  variant?: TextFieldVariant;
  /** Merged with the variant input classes (e.g. `flex-1`, `text-sm`). */
  className?: string;
  /** Wrapper around label+input+error; default `block`. */
  wrapperClassName?: string;
  errorClassName?: string;
}

export function TextField({
  label,
  labelHtmlFor,
  error,
  errorId,
  variant = 'standard',
  className = '',
  wrapperClassName = 'block min-w-0',
  errorClassName = 'mt-1 text-xs text-red-500 font-ui',
  ...inputProps
}: TextFieldProps) {
  const inputClass = `${VARIANT_CLASS[variant]} ${className}`.trim();

  return (
    <div className={wrapperClassName}>
      <label htmlFor={labelHtmlFor} className="block font-ui text-sm font-medium text-body mb-1">
        {label}
      </label>
      <input
        id={labelHtmlFor}
        className={inputClass}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} role="alert" className={errorClassName}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
