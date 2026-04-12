import type { UseMutationResult } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { Trip } from '@travel-journal/shared';

interface TripDetailsSectionProps {
  t: TFunction;
  name: string;
  setName: (v: string) => void;
  updateMutation: UseMutationResult<Trip, Error, { name?: string }, unknown>;
}

export function TripDetailsSection({
  t,
  name,
  setName,
  updateMutation,
}: TripDetailsSectionProps) {
  return (
    <section>
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
        {t('trips.settings.detailsTitle')}
      </h2>
      <div className="space-y-3">
        <div>
          <label htmlFor="settings-name" className="block font-ui text-sm font-medium text-body mb-1">
            {t('trips.create.nameLabel')}
          </label>
          <input
            id="settings-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          type="button"
          onClick={() => updateMutation.mutate({ name })}
          disabled={updateMutation.isPending}
          className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {t('common.save')}
        </button>
      </div>
    </section>
  );
}
