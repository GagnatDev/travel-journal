import { useEffect, useState } from 'react';

export function useNetworkStatus(): { isOnline: boolean } {
  // navigator.onLine may be undefined in some environments; default to online
  const [isOnline, setIsOnline] = useState(navigator.onLine !== false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
