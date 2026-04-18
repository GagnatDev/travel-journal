import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TripEntryNotificationMode } from '@travel-journal/shared';

import { patchMyTripNotificationPreferences } from '../api/trips.js';
import { useAuth } from '../context/AuthContext.js';

import { ensurePushSubscription } from './push.js';

const TRIP_QUERY_KEY_PREFIX = ['trip'] as const;

interface UseTripNotificationModeMutationOptions {
  tripId: string | undefined;
  /** Invoked with the resolved permission whenever a non-off mode is set. */
  onPushPermissionResolved?: (permission: NotificationPermission | 'unsupported') => void;
}

/**
 * Updates the viewer's per-trip new-entry notification mode.
 *
 * When switching to any non-`off` mode, the hook first ensures the browser
 * has a working push subscription and throws a translated error if permission
 * cannot be obtained. On success the trip-detail query is invalidated so the
 * viewer sees their new preference reflected immediately.
 */
export function useTripNotificationModeMutation({
  tripId,
  onPushPermissionResolved,
}: UseTripNotificationModeMutationOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { accessToken } = useAuth();

  return useMutation({
    mutationFn: async (newEntriesMode: TripEntryNotificationMode) => {
      if (!tripId || !accessToken) {
        throw new Error('Missing trip or auth context');
      }
      if (newEntriesMode !== 'off') {
        const permission = await ensurePushSubscription(accessToken);
        onPushPermissionResolved?.(permission);
        if (permission !== 'granted') {
          throw new Error(t('trips.notificationMode.permissionRequired'));
        }
      }
      return patchMyTripNotificationPreferences(tripId, { newEntriesMode }, accessToken);
    },
    onSuccess: () => {
      if (!tripId) return;
      void queryClient.invalidateQueries({ queryKey: [...TRIP_QUERY_KEY_PREFIX, tripId] });
    },
  });
}
