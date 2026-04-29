import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Trip } from '@travel-journal/shared';

import { fetchTrips } from '../api/trips.js';
import { QUERY_STALE_MS } from '../lib/appQueryClient.js';
import { useAuth } from '../context/AuthContext.js';
import { TripCard } from '../components/TripCard.js';
import { CreateTripModal } from '../components/CreateTripModal.js';

type TripGroupProps = {
  label: string;
  items: Trip[];
  currentUserId: string;
  highlightTripId: string | null;
};

function TripGroup({ label, items, currentUserId, highlightTripId }: TripGroupProps) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-2">
        {label}
      </h2>
      <ul className="space-y-3">
        {items.map((trip) => (
          <li key={trip.id}>
            <TripCard
              trip={trip}
              currentUserId={currentUserId}
              isHighlighted={highlightTripId === trip.id}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TripDashboardScreen() {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightTripId = searchParams.get('highlightTripId');
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const dashboardRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightTripId) {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
    }
  }, [highlightTripId, queryClient]);

  useEffect(() => {
    if (!highlightTripId) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('highlightTripId');
      setSearchParams(next, { replace: true });
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [highlightTripId, searchParams, setSearchParams]);

  useEffect(() => {
    const el = dashboardRootRef.current;
    if (!el) return;
    if (showCreate) {
      el.setAttribute('inert', '');
      return () => {
        el.removeAttribute('inert');
      };
    }
  }, [showCreate]);

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => fetchTrips(accessToken!),
    enabled: !!accessToken,
    staleTime: QUERY_STALE_MS.trips,
  });

  const active = trips.filter((t) => t.status === 'active');
  const planned = trips.filter((t) => t.status === 'planned');
  const completed = trips.filter((t) => t.status === 'completed');

  const canCreate = user?.appRole === 'admin' || user?.appRole === 'creator';
  const currentUserId = user?.id ?? '';

  return (
    <>
      <div
        ref={dashboardRootRef}
        className="min-h-screen bg-bg-primary pb-24 pt-14"
        id="trip-dashboard-root"
      >
        <header className="px-4 pt-8 pb-4 flex items-center justify-between">
          <h1 className="font-display text-2xl text-heading">{t('trips.dashboard.title')}</h1>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all"
            >
              {t('trips.dashboard.createButton')}
            </button>
          )}
        </header>

        <main className="px-4 space-y-6">
          {isLoading ? (
            <p className="font-ui text-body text-center py-12">{t('common.loading')}</p>
          ) : trips.length === 0 ? (
            <p className="font-ui text-body text-center py-12">{t('trips.dashboard.emptyState')}</p>
          ) : (
            <>
              <TripGroup
                label={t('trips.dashboard.statusGroup.active')}
                items={active}
                currentUserId={currentUserId}
                highlightTripId={highlightTripId}
              />
              <TripGroup
                label={t('trips.dashboard.statusGroup.planned')}
                items={planned}
                currentUserId={currentUserId}
                highlightTripId={highlightTripId}
              />
              <TripGroup
                label={t('trips.dashboard.statusGroup.completed')}
                items={completed}
                currentUserId={currentUserId}
                highlightTripId={highlightTripId}
              />
            </>
          )}
        </main>
      </div>

      {showCreate && <CreateTripModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
