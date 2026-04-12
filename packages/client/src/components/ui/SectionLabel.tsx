import type { ReactNode } from 'react';

interface SectionLabelProps {
  children: ReactNode;
  badge?: ReactNode;
  className?: string;
}

export function SectionLabel({ children, badge, className = '' }: SectionLabelProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <h2 className="font-ui text-label-caps uppercase tracking-widest text-caption">
        {children}
      </h2>
      {badge !== undefined && (
        <span className="bg-sage-bg text-body rounded-full px-2 py-0.5 text-label-caps font-semibold">
          {badge}
        </span>
      )}
    </div>
  );
}
