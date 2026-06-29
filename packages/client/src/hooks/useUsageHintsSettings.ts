import { useEffect, useState } from 'react';

import {
  USAGE_HINTS_CHANGED_EVENT,
  getUsageHintsPrefs,
  resetDismissedUsageHints,
  setUsageHintsEnabled,
} from '../lib/usageHintsPrefs.js';

export function useUsageHintsSettings() {
  const [prefs, setPrefs] = useState(getUsageHintsPrefs);

  useEffect(() => {
    const sync = () => setPrefs(getUsageHintsPrefs());
    window.addEventListener(USAGE_HINTS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USAGE_HINTS_CHANGED_EVENT, sync);
  }, []);

  return {
    enabled: prefs.enabled,
    dismissedCount: Object.keys(prefs.dismissed).length,
    setEnabled: setUsageHintsEnabled,
    resetDismissed: resetDismissedUsageHints,
  };
}
