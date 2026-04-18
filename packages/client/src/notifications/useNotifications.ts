import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification, ListNotificationsResponse } from '@travel-journal/shared';

import {
  clearAllNotifications,
  dismissNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notifications.js';
import { useAuth } from '../context/AuthContext.js';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;
export const NOTIFICATIONS_POLL_INTERVAL_MS = 60_000;

const EMPTY_LIST: ListNotificationsResponse = { notifications: [], unreadCount: 0 };

export function useNotificationsQuery() {
  const { accessToken, status } = useAuth();
  return useQuery<ListNotificationsResponse>({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: ({ signal }) => fetchNotifications(accessToken!, signal),
    enabled: status === 'authenticated' && !!accessToken,
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useNotifications(): {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
} {
  const query = useNotificationsQuery();
  const data = query.data ?? EMPTY_LIST;
  return {
    notifications: data.notifications,
    unreadCount: data.unreadCount,
    isLoading: query.isLoading,
  };
}

function updateCache(
  client: ReturnType<typeof useQueryClient>,
  updater: (prev: ListNotificationsResponse) => ListNotificationsResponse,
): ListNotificationsResponse | undefined {
  const prev = client.getQueryData<ListNotificationsResponse>(NOTIFICATIONS_QUERY_KEY);
  const base = prev ?? EMPTY_LIST;
  const next = updater(base);
  client.setQueryData<ListNotificationsResponse>(NOTIFICATIONS_QUERY_KEY, next);
  return prev;
}

export function useMarkNotificationsRead() {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation<void, Error, void, { prev?: ListNotificationsResponse }>({
    mutationFn: () => markAllNotificationsRead(accessToken!),
    onMutate: () => {
      const prev = updateCache(client, (base) => ({
        notifications: base.notifications.map((n) =>
          n.readAt ? n : { ...n, readAt: new Date().toISOString() },
        ),
        unreadCount: 0,
      }));
      return prev ? { prev } : {};
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) client.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

export function useMarkNotificationRead() {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation<void, Error, string, { prev?: ListNotificationsResponse }>({
    mutationFn: (id) => markNotificationRead(accessToken!, id),
    onMutate: (id) => {
      const prev = updateCache(client, (base) => {
        let delta = 0;
        const notifications = base.notifications.map((n) => {
          if (n.id !== id || n.readAt) return n;
          delta += 1;
          return { ...n, readAt: new Date().toISOString() };
        });
        return {
          notifications,
          unreadCount: Math.max(0, base.unreadCount - delta),
        };
      });
      return prev ? { prev } : {};
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) client.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

export function useDismissNotification() {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation<void, Error, string, { prev?: ListNotificationsResponse }>({
    mutationFn: (id) => dismissNotification(accessToken!, id),
    onMutate: (id) => {
      const prev = updateCache(client, (base) => {
        const removed = base.notifications.find((n) => n.id === id);
        const wasUnread = removed && !removed.readAt ? 1 : 0;
        return {
          notifications: base.notifications.filter((n) => n.id !== id),
          unreadCount: Math.max(0, base.unreadCount - wasUnread),
        };
      });
      return prev ? { prev } : {};
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) client.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

export function useClearAllNotifications() {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation<void, Error, void, { prev?: ListNotificationsResponse }>({
    mutationFn: () => clearAllNotifications(accessToken!),
    onMutate: () => {
      const prev = updateCache(client, () => ({ notifications: [], unreadCount: 0 }));
      return prev ? { prev } : {};
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) client.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}
