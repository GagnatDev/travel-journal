import type { UseMutationResult } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { Trip, TripStatus } from '@travel-journal/shared';

interface TripStatusSectionProps {
  t: TFunction;
  tripStatus: Trip['status'];
  statusMutation: UseMutationResult<Trip, Error, TripStatus, unknown>;
}

const statusButtonClass =
  'px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all';

export function TripStatusSection({ t, tripStatus, statusMutation }: TripStatusSectionProps) {
  return (
    <section>
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
        {t('trips.settings.statusTitle')}
      </h2>
      <div className="flex flex-wrap gap-2">
        {tripStatus === 'planned' && (
          <button
            type="button"
            onClick={() => statusMutation.mutate('active')}
            disabled={statusMutation.isPending}
            className={statusButtonClass}
          >
            {t('trips.settings.markActive')}
          </button>
        )}
        {tripStatus === 'active' && (
          <button
            type="button"
            onClick={() => statusMutation.mutate('completed')}
            disabled={statusMutation.isPending}
            className={statusButtonClass}
          >
            {t('trips.settings.markCompleted')}
          </button>
        )}
        {tripStatus === 'completed' && (
          <button
            type="button"
            onClick={() => statusMutation.mutate('active')}
            disabled={statusMutation.isPending}
            className={statusButtonClass}
          >
            {t('trips.settings.reopen')}
          </button>
        )}
      </div>
    </section>
  );
}
