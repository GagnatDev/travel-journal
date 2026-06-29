import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useUsageHint } from '../hooks/useUsageHint.js';

interface UsageHintBannerProps {
  hintId: string;
  when?: boolean;
  children: ReactNode;
  className?: string;
}

export function UsageHintBanner({
  hintId,
  when = true,
  children,
  className = '',
}: UsageHintBannerProps) {
  const { t } = useTranslation();
  const { visible, dismiss } = useUsageHint(hintId, when);

  if (!visible) return null;

  return (
    <div
      role="status"
      className={`rounded-card border border-caption/10 bg-bg-secondary px-4 py-3 flex items-start justify-between gap-3 font-ui text-sm text-body ${className}`}
      data-testid={`usage-hint-${hintId.split(':').pop()}`}
    >
      <span className="min-w-0">{children}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('hints.dismiss')}
        className="shrink-0 text-caption hover:text-heading font-bold leading-none pt-0.5"
      >
        ×
      </button>
    </div>
  );
}
