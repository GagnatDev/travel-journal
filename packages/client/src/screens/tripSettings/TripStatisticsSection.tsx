import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { fetchTripStats } from '../../api/entries.js';
import { QUERY_STALE_MS } from '../../lib/appQueryClient.js';

interface TripStatisticsSectionProps {
  t: TFunction;
  tripId: string;
  accessToken: string;
}

interface StatTileProps {
  label: string;
  value: number;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-round-eight bg-bg-secondary px-4 py-3">
      <span className="font-display text-3xl text-heading tabular-nums">{value}</span>
      <span className="font-ui text-xs text-caption">{label}</span>
    </div>
  );
}

export function TripStatisticsSection({ t, tripId, accessToken }: TripStatisticsSectionProps) {
  const { data: stats } = useQuery({
    queryKey: ['trip-stats', tripId],
    queryFn: () => fetchTripStats(tripId, accessToken),
    enabled: !!tripId && !!accessToken,
    staleTime: QUERY_STALE_MS.entriesFeed,
  });

  return (
    <section>
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
        {t('trips.settings.statisticsTitle')}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t('trips.settings.statsEntries')} value={stats?.entryCount ?? 0} />
        <StatTile label={t('trips.settings.statsPhotos')} value={stats?.photoCount ?? 0} />
        <StatTile
          label={t('trips.settings.statsLocations')}
          value={stats?.uniqueLocationCount ?? 0}
        />
        <StatTile
          label={t('trips.settings.statsContributors')}
          value={stats?.contributorCount ?? 0}
        />
      </div>
    </section>
  );
}
