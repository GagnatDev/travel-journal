import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch, useNavigate } from 'react-router-dom';

import { fetchPushServerAvailability, type PushServerAvailability } from '../api/notifications.js';
import { useAuth } from '../context/AuthContext.js';
import { getPushPermissionState, type PushPermissionState } from '../notifications/push.js';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const tripMatch = useMatch('/trips/:id/*');
  const tripId = tripMatch?.params.id;
  const titleId = useId();

  const [deviceState, setDeviceState] = useState<PushPermissionState>(() => getPushPermissionState());
  const [serverAvail, setServerAvail] = useState<PushServerAvailability | 'loading'>('loading');

  useEffect(() => {
    if (!isOpen) return;
    setDeviceState(getPushPermissionState());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!accessToken) {
      setServerAvail('error');
      return;
    }
    const ac = new AbortController();
    setServerAvail('loading');
    void fetchPushServerAvailability(accessToken, ac.signal)
      .then((s) => {
        setServerAvail(s);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setServerAvail('error');
      });
    return () => ac.abort();
  }, [isOpen, accessToken]);

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

        <div className="flex-1 px-4 py-4 overflow-y-auto space-y-5 font-ui text-sm text-body">
          <p>{t('notifications.intro')}</p>
          <p>{t('notifications.tripSettingsHint')}</p>

          <div>
            <h3 className="font-ui font-medium text-heading text-sm mb-2">{t('notifications.statusHeading')}</h3>
            <p className="text-body">{deviceMessage}</p>
          </div>

          <div>
            <h3 className="font-ui font-medium text-heading text-sm mb-2">{t('notifications.serverHeading')}</h3>
            <p className="text-body">{serverMessage}</p>
          </div>

          <div className="flex flex-col gap-2 pt-1">
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
        </div>
      </div>
    </>
  );
}
