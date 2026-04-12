import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getPendingCount, getFailedCount, PENDING_CHANGED_EVENT } from '../offline/entrySync.js';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';

export function SyncStatus() {
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [pending, failed] = await Promise.all([getPendingCount(), getFailedCount()]);
        if (!cancelled) {
          setPendingCount(pending);
          setFailedCount(failed);
        }
      } catch {
        // IDB unavailable (private browsing, test env, etc.) — show nothing
      }
    }

    void refresh();

    window.addEventListener(PENDING_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PENDING_CHANGED_EVENT, refresh);
    };
  }, []);

  if (pendingCount === 0) return null;

  if (failedCount > 0) {
    return (
      <span
        aria-live="polite"
        className="font-ui text-xs text-red-600 flex items-center gap-1"
      >
        <svg
          aria-hidden="true"
          className="w-3 h-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {t('offline.syncFailed', { count: failedCount })}
      </span>
    );
  }

  return (
    <span
      aria-live="polite"
      className="font-ui text-xs text-caption flex items-center gap-1"
    >
      {isOnline ? (
        <svg
          aria-hidden="true"
          className="w-3 h-3 animate-spin text-accent"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className="w-3 h-3 text-yellow-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )}
      {t('offline.syncing', { count: pendingCount })}
    </span>
  );
}
