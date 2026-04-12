import type { ReactNode, TextareaHTMLAttributes } from 'react';

import {
  entryTextFieldClass,
  standardTextFieldClass,
  type TextFieldVariant,
} from './fieldStyles.js';

const VARIANT_CLASS: Record<TextFieldVariant, string> = {
  standard: standardTextFieldClass,
  entry: entryTextFieldClass,
};

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label: ReactNode;
  labelHtmlFor: string;
  error?: string;
  errorId?: string;
  variant?: TextFieldVariant;
  className?: string;
  wrapperClassName?: string;
  errorClassName?: string;
}

export function TextArea({
  label,
  labelHtmlFor,
  error,
  errorId,
  variant = 'standard',
  className = '',
  wrapperClassName = 'block',
  errorClassName = 'mt-1 text-xs text-red-500 font-ui',
  ...textareaProps
}: TextAreaProps) {
  const areaClass = `${VARIANT_CLASS[variant]} ${className}`.trim();

  return (
    <div className={wrapperClassName}>
      <label htmlFor={labelHtmlFor} className="block font-ui text-sm font-medium text-body mb-1">
        {label}
      </label>
      <textarea
        id={labelHtmlFor}
        className={areaClass}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        {...textareaProps}
      />
      {error ? (
        <p id={errorId} role="alert" className={errorClassName}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
