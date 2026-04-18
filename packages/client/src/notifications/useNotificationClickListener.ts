import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { NOTIFICATIONS_QUERY_KEY } from './useNotifications.js';

interface NotificationClickedMessage {
  type: 'notification-clicked';
  url?: string;
  notificationId?: string;
}

function isNotificationClickedMessage(data: unknown): data is NotificationClickedMessage {
  if (!data || typeof data !== 'object') return false;
  const t = (data as { type?: unknown }).type;
  return t === 'notification-clicked';
}

/**
 * Listens for `notification-clicked` messages posted by the service worker
 * when the user taps a Web Push notification. Navigates the SPA to the URL
 * encoded in the payload and refreshes the inbox so the list/badge reflects
 * the new state without waiting for the next poll.
 */
export function useNotificationClickListener(): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const handler = (event: MessageEvent) => {
      if (!isNotificationClickedMessage(event.data)) return;
      const { url } = event.data;
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      if (url) {
        // Keep the URL internal so we don't bounce the user out of the SPA.
        try {
          const parsed = new URL(url, window.location.origin);
          if (parsed.origin === window.location.origin) {
            navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`);
          }
        } catch {
          // Fall through — ignore malformed URLs from the SW.
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
    };
  }, [navigate, queryClient]);
}
