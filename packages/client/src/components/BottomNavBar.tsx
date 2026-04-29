import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TripRole } from '@travel-journal/shared';

import { canAccessTripSettingsScreen } from '../screens/tripSettings/tripSettingsPermissions.js';
import { HomeIcon, MapPinIcon, PeopleIcon, PlusIcon, TimelineIcon } from './icons/index.js';
import { SyncStatus } from './SyncStatus.js';

interface BottomNavBarProps {
  tripId?: string;
  tripRole?: TripRole;
}

export function BottomNavBar({ tripId, tripRole }: BottomNavBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const canAddEntry = tripRole === 'creator' || tripRole === 'contributor';
  const canOpenTripSettings = canAccessTripSettingsScreen(tripRole);

  function navItem(label: string, path: string, icon: ReactNode) {
    const isActive = location.pathname === path;
    return (
      <button
        type="button"
        aria-current={isActive ? 'page' : undefined}
        onClick={() => navigate(path)}
        className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 font-ui text-xs transition-colors rounded-lg ${
          isActive ? 'text-accent' : 'text-caption'
        }`}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-10 pb-safe md:bg-transparent bg-bg-primary"
      data-viewer-trip-role={tripRole}
    >
      <div className="max-w-lg mx-auto bg-bg-primary border-t border-caption/20 md:rounded-t-xl md:border-x md:border-caption/20 md:shadow-[0_-4px_24px_rgba(0,0,0,0.06)] dark:md:shadow-[0_-4px_24px_rgba(0,0,0,0.25)]">
        <div className="flex justify-center px-4 pt-1">
          <SyncStatus />
        </div>
        <div className="flex items-center px-4 py-2 relative">
          {tripId ? (
            canAddEntry ? (
              // FAB layout: Timeline | Map | [FAB spacer] | Settings
              <>
                <div className="flex-1 flex justify-around">
                  {navItem(
                    t('trips.nav.timeline'),
                    `/trips/${tripId}/timeline`,
                    <TimelineIcon width={20} height={20} aria-hidden="true" />,
                  )}
                  {navItem(
                    t('trips.nav.map'),
                    `/trips/${tripId}/map`,
                    <MapPinIcon width={20} height={20} aria-hidden="true" />,
                  )}
                </div>
                <div className="w-14 shrink-0" />
                <div className="flex-1 flex justify-around">
                  {canOpenTripSettings &&
                    navItem(
                      t('trips.nav.settings'),
                      `/trips/${tripId}/settings`,
                      <PeopleIcon width={20} height={20} aria-hidden="true" />,
                    )}
                </div>
              </>
            ) : (
              // No FAB: evenly distribute allowed items (followers see only timeline + map)
              <div className="flex-1 flex justify-around">
                {navItem(
                  t('trips.nav.timeline'),
                  `/trips/${tripId}/timeline`,
                  <TimelineIcon width={20} height={20} aria-hidden="true" />,
                )}
                {navItem(
                  t('trips.nav.map'),
                  `/trips/${tripId}/map`,
                  <MapPinIcon width={20} height={20} aria-hidden="true" />,
                )}
                {canOpenTripSettings &&
                  navItem(
                    t('trips.nav.settings'),
                    `/trips/${tripId}/settings`,
                    <PeopleIcon width={20} height={20} aria-hidden="true" />,
                  )}
              </div>
            )
          ) : (
            <div className="flex-1 flex justify-around">
              {navItem(t('nav.trips'), '/trips', <HomeIcon width={20} height={20} aria-hidden="true" />)}
            </div>
          )}

          {/* Centered FAB — Add Entry */}
          {canAddEntry && tripId && (
            <div className="absolute left-1/2 -translate-x-1/2 -top-6 z-20">
              <button
                type="button"
                onClick={() => navigate(`/trips/${tripId}/entries/new`)}
                className="w-14 h-14 bg-accent text-white rounded-full flex items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-all"
                aria-label={t('trips.nav.addEntry')}
              >
                <PlusIcon width={24} height={24} />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
