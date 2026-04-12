import type { ReactNode } from 'react';

interface IconBadgeProps {
  children: ReactNode;
  className?: string;
}

export function IconBadge({ children, className = '' }: IconBadgeProps) {
  return (
    <span
      className={`rounded-lg bg-sage-bg p-1.5 flex items-center justify-center shrink-0 ${className}`}
    >
      {children}
    </span>
  );
}
