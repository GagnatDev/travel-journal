import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  fullWidth?: boolean;
  variant?: 'primary' | 'ghost';
}

export function PillButton({
  children,
  icon,
  fullWidth = false,
  variant = 'primary',
  className = '',
  ...buttonProps
}: PillButtonProps) {
  const base =
    'rounded-full font-ui font-semibold uppercase tracking-wide py-3 px-6 flex items-center justify-center gap-2 transition-all disabled:opacity-50';
  const variantClass =
    variant === 'ghost'
      ? 'border border-accent text-accent bg-transparent hover:bg-accent hover:text-white active:scale-95'
      : 'bg-accent text-white hover:opacity-90 active:scale-95';
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${base} ${variantClass} ${widthClass} ${className}`}
      {...buttonProps}
    >
      {icon !== undefined && <span aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
