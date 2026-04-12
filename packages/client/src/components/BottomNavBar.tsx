import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TripRole } from '@travel-journal/shared';

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

  function navItem(label: string, path: string) {
    const isActive = location.pathname === path;
    return (
      <button
        onClick={() => navigate(path)}
        className={`flex flex-col items-center gap-0.5 px-3 py-1 font-ui text-xs transition-colors ${
          isActive ? 'text-accent' : 'text-caption'
        }`}
      >
        <span>{label}</span>
      </button>
    );
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-bg-primary border-t border-caption/20 pb-safe">
      <div className="max-w-lg mx-auto flex justify-center px-4 pt-1">
        <SyncStatus />
      </div>
      <div className="max-w-lg mx-auto flex items-center px-4 py-2 relative">
        {tripId ? (
          canAddEntry ? (
            // FAB layout: Timeline | [FAB spacer] | Map + Settings
            // The w-14 spacer sits at the horizontal centre so the absolute FAB lands over it
            <>
              <div className="flex-1 flex justify-center">
                {navItem(t('trips.nav.timeline'), `/trips/${tripId}/timeline`)}
              </div>
              <div className="w-14 shrink-0" />
              <div className="flex-1 flex justify-around">
                {navItem(t('trips.nav.map'), `/trips/${tripId}/map`)}
                {navItem(t('trips.nav.settings'), `/trips/${tripId}/settings`)}
              </div>
            </>
          ) : (
            // No FAB: evenly distribute all three items
            <div className="flex-1 flex justify-around">
              {navItem(t('trips.nav.timeline'), `/trips/${tripId}/timeline`)}
              {navItem(t('trips.nav.map'), `/trips/${tripId}/map`)}
              {navItem(t('trips.nav.settings'), `/trips/${tripId}/settings`)}
            </div>
          )
        ) : (
          <div className="flex-1 flex justify-around">
            {navItem(t('nav.trips'), '/trips')}
          </div>
        )}

        {/* Centered FAB — Add Entry */}
        {canAddEntry && tripId && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-6">
            <button
              onClick={() => navigate(`/trips/${tripId}/entries/new`)}
              className="w-14 h-14 bg-accent text-white rounded-full flex items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-all font-ui font-bold text-2xl"
              aria-label={t('trips.nav.addEntry')}
            >
              +
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
