import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Trip } from '@travel-journal/shared';

import { fetchTrips } from '../api/trips.js';
import { useAuth } from '../context/AuthContext.js';
import { TripCard } from '../components/TripCard.js';
import { CreateTripModal } from '../components/CreateTripModal.js';

type TripGroupProps = {
  label: string;
  items: Trip[];
  currentUserId: string;
};

function TripGroup({ label, items, currentUserId }: TripGroupProps) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-2">
        {label}
      </h2>
      <ul className="space-y-3">
        {items.map((trip) => (
          <li key={trip.id}>
            <TripCard trip={trip} currentUserId={currentUserId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TripDashboardScreen() {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => fetchTrips(accessToken!),
    enabled: !!accessToken,
  });

  const active = trips.filter((t) => t.status === 'active');
  const planned = trips.filter((t) => t.status === 'planned');
  const completed = trips.filter((t) => t.status === 'completed');

  const canCreate = user?.appRole === 'admin' || user?.appRole === 'creator';
  const currentUserId = user?.id ?? '';

  return (
    <div className="min-h-screen bg-bg-primary pb-24 pt-14">
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
            />
            <TripGroup
              label={t('trips.dashboard.statusGroup.planned')}
              items={planned}
              currentUserId={currentUserId}
            />
            <TripGroup
              label={t('trips.dashboard.statusGroup.completed')}
              items={completed}
              currentUserId={currentUserId}
            />
          </>
        )}
      </main>

      {showCreate && <CreateTripModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
