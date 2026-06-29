import { useCallback, useEffect, useState } from 'react';

import {
  USAGE_HINTS_CHANGED_EVENT,
  dismissUsageHint,
  isUsageHintVisible,
} from '../lib/usageHintsPrefs.js';

export function useUsageHint(hintId: string, when = true) {
  const [visible, setVisible] = useState(() => when && isUsageHintVisible(hintId));

  useEffect(() => {
    setVisible(when && isUsageHintVisible(hintId));
  }, [hintId, when]);

  useEffect(() => {
    const sync = () => setVisible(when && isUsageHintVisible(hintId));
    window.addEventListener(USAGE_HINTS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USAGE_HINTS_CHANGED_EVENT, sync);
  }, [hintId, when]);

  const dismiss = useCallback(() => {
    dismissUsageHint(hintId);
  }, [hintId]);

  return { visible, dismiss };
}
