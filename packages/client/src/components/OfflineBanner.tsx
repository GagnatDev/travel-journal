import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNetworkStatus } from '../hooks/useNetworkStatus.js';

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  // Re-show banner whenever we go offline
  useEffect(() => {
    if (!isOnline) setDismissed(false);
  }, [isOnline]);

  if (isOnline || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-2 bg-yellow-100 border-b border-yellow-300 px-4 py-2 font-ui text-sm text-yellow-900"
    >
      <span>{t('offline.banner')}</span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="ml-2 text-yellow-700 hover:text-yellow-900 font-bold leading-none"
      >
        ×
      </button>
    </div>
  );
}
