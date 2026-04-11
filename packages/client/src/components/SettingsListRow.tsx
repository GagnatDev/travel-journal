import type { ReactNode } from 'react';

export type SettingsListRowDensity = 'comfortable' | 'compact';

const densityClass: Record<SettingsListRowDensity, string> = {
  comfortable: 'p-3',
  compact: 'p-2',
};

export interface SettingsListRowProps {
  main: ReactNode;
  actions?: ReactNode;
  density?: SettingsListRowDensity;
  className?: string;
}

export function SettingsListRow({
  main,
  actions,
  density = 'comfortable',
  className = '',
}: SettingsListRowProps) {
  const pad = densityClass[density];
  return (
    <div
      className={`flex items-center justify-between gap-2 bg-bg-secondary rounded-round-eight ${pad} ${className}`.trim()}
    >
      <div className="min-w-0 flex-1">{main}</div>
      {actions != null ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
