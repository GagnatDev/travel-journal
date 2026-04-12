import type { ReactNode } from 'react';

interface InfoBoxProps {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export function InfoBox({ icon, children, className = '' }: InfoBoxProps) {
  return (
    <div className={`rounded-card bg-bg-secondary border border-caption/20 flex gap-3 p-4 font-ui text-sm text-body ${className}`}>
      <span className="shrink-0 text-accent mt-0.5">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
