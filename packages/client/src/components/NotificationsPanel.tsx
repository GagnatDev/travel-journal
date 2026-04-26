import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppNotification } from '@travel-journal/shared';
import { useMatch, useNavigate } from 'react-router-dom';

import { fetchPushServerAvailability, type PushServerAvailability } from '../api/notifications.js';
import { useAuth } from '../context/AuthContext.js';
import { BUILD_ID } from '../lib/appBuildId.js';
import { useDeploymentUpdateNotice } from '../lib/useDeploymentUpdateNotice.js';
import { getPushPermissionState, type PushPermissionState } from '../notifications/push.js';
import {
  useClearAllNotifications,
  useDismissNotification,
  useMarkNotificationsRead,
  useNotifications,
} from '../notifications/useNotifications.js';

import { NotificationItem } from './notifications/NotificationItem.js';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}

export function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const { t } = useTranslation();
  const { accessToken, status: authStatus } = useAuth();
  const navigate = useNavigate();
  const tripMatch = useMatch('/trips/:id/*');
  const tripId = tripMatch?.params.id;
  const titleId = useId();

  const [deviceState, setDeviceState] = useState<PushPermissionState>(() => getPushPermissionState());
  const [serverAvail, setServerAvail] = useState<PushServerAvailability | 'loading'>('loading');
  const [pushStatusOpen, setPushStatusOpen] = useState(false);

  const { notifications, isLoading } = useNotifications();
  const { hasNewDeployment } = useDeploymentUpdateNotice(isOpen);
  const markAllRead = useMarkNotificationsRead();
  const dismiss = useDismissNotification();
  const clearAll = useClearAllNotifications();
  const markAllReadMutate = markAllRead.mutate;

  const hasMarkedOnOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasMarkedOnOpenRef.current = false;
      return;
    }
    setDeviceState(getPushPermissionState());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (hasMarkedOnOpenRef.current) return;
    if (notifications.some((n) => n.readAt === null)) {
      hasMarkedOnOpenRef.current = true;
      markAllReadMutate();
    }
  }, [isOpen, notifications, markAllReadMutate]);

  useEffect(() => {
    if (!isOpen) return;
    if (authStatus === 'loading') {
      setServerAvail('loading');
      return;
    }
    if (!accessToken) {
      setServerAvail('error');
      return;
    }
    const ac = new AbortController();
    let active = true;
    setServerAvail('loading');
    void fetchPushServerAvailability(accessToken, ac.signal)
      .then((s) => {
        if (active) setServerAvail(s);
      })
      .catch((err: unknown) => {
        if (!active || isAbortError(err)) return;
        setServerAvail('error');
      });
    return () => {
      active = false;
      ac.abort();
    };
  }, [isOpen, accessToken, authStatus]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const deviceMessage =
    deviceState === 'unsupported'
      ? t('trips.settings.notificationsUnsupported')
      : deviceState === 'denied'
        ? t('trips.settings.notificationsDenied')
        : deviceState === 'granted'
          ? t('notifications.deviceGranted')
          : t('notifications.deviceDefault');

  const serverMessage =
    serverAvail === 'loading'
      ? t('notifications.loadingServer')
      : serverAvail === 'available'
        ? t('notifications.serverAvailable')
        : serverAvail === 'unavailable'
          ? t('notifications.serverUnavailable')
          : t('notifications.serverError');

  const pushStatusNeedsAttention =
    deviceState === 'denied' ||
    deviceState === 'unsupported' ||
    serverAvail === 'unavailable' ||
    serverAvail === 'error';

  useEffect(() => {
    if (pushStatusNeedsAttention) setPushStatusOpen(true);
  }, [pushStatusNeedsAttention]);

  const handleActivate = (notification: AppNotification, href: string) => {
    dismiss.mutate(notification.id);
    onClose();
    navigate(href);
  };

  const handleDismiss = (notification: AppNotification) => {
    dismiss.mutate(notification.id);
  };

  const handleClearAll = () => {
    clearAll.mutate();
  };

  const goTripSettings = () => {
    if (tripId) {
      navigate(`/trips/${tripId}/settings`);
      onClose();
    }
  };

  const goTripsHome = () => {
    navigate('/trips');
    onClose();
  };

  return (
    <>
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed top-0 right-0 z-50 h-full w-[min(100vw,22rem)] max-w-full bg-bg-primary border-l border-caption/10 shadow-xl flex flex-col transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-caption/10 shrink-0 gap-2">
          <h2 id={titleId} className="font-display text-base text-heading truncate">
            {t('notifications.panelTitle')}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="font-ui text-xs text-caption hover:text-heading transition-colors px-2 py-1 rounded-md"
              >
                {t('notifications.clearAll')}
              </button>
            )}
            <button
              type="button"
              aria-label={t('notifications.closePanel')}
              onClick={onClose}
              className="shrink-0 text-caption hover:text-body transition-colors p-1 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 overflow-y-auto space-y-4 font-ui text-sm text-body">
          {BUILD_ID.length > 0 && hasNewDeployment && (
            <div
              role="status"
              data-testid="deployment-update-notice"
              className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-3 text-body"
            >
              <p className="font-ui text-sm font-medium text-heading">
                {t('notifications.deploymentUpdateTitle')}
              </p>
              <p className="font-ui text-xs mt-1.5 leading-snug">
                {t('notifications.deploymentUpdateBody')}
              </p>
              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                className="mt-3 font-ui text-sm font-medium text-accent hover:text-heading transition-colors underline underline-offset-2"
              >
                {t('notifications.deploymentUpdateReload')}
              </button>
            </div>
          )}

          {notifications.length === 0 ? (
            <p className="text-caption text-center py-6" data-testid="notifications-empty">
              {isLoading ? '' : t('notifications.empty')}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="notifications-list">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onActivate={handleActivate}
                  onDismiss={handleDismiss}
                />
              ))}
            </ul>
          )}

          <div className="pt-2 border-t border-caption/10 flex flex-col gap-1">
            {tripId && (
              <button
                type="button"
                onClick={goTripSettings}
                className="w-full text-left font-ui text-sm text-accent hover:text-heading transition-colors py-2 rounded-lg"
              >
                {t('notifications.openTripSettings')}
              </button>
            )}
            <button
              type="button"
              onClick={goTripsHome}
              className="w-full text-left font-ui text-sm text-accent hover:text-heading transition-colors py-2 rounded-lg"
            >
              {t('notifications.goToTrips')}
            </button>
          </div>

          <details
            className="rounded-lg border border-caption/10 bg-bg-secondary px-3 py-2"
            open={pushStatusOpen}
            onToggle={(e) => setPushStatusOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer font-ui text-xs font-medium text-heading">
              {t('notifications.pushStatusHeading')}
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <h3 className="font-ui font-medium text-heading text-xs mb-1">
                  {t('notifications.statusHeading')}
                </h3>
                <p className="text-body text-xs">{deviceMessage}</p>
              </div>

              <div>
                <h3 className="font-ui font-medium text-heading text-xs mb-1">
                  {t('notifications.serverHeading')}
                </h3>
                <p className="text-body text-xs">{serverMessage}</p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
