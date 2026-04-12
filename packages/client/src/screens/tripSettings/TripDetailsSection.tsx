import type { UseMutationResult } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { Trip } from '@travel-journal/shared';

import { TextField } from '../../components/ui/TextField.js';

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
        <TextField
          label={t('trips.create.nameLabel')}
          labelHtmlFor="settings-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
