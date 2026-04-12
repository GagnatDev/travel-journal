import type { UseMutationResult } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

interface TripDeleteSectionProps {
  t: TFunction;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (v: boolean) => void;
  deleteMutation: UseMutationResult<void, Error, void, unknown>;
}

export function TripDeleteSection({
  t,
  showDeleteConfirm,
  setShowDeleteConfirm,
  deleteMutation,
}: TripDeleteSectionProps) {
  return (
    <section>
      {!showDeleteConfirm ? (
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
        >
          {t('trips.settings.deleteButton')}
        </button>
      ) : (
        <div className="p-4 bg-bg-secondary rounded-round-eight space-y-3">
          <p className="font-ui text-sm text-body">{t('trips.settings.deleteConfirmMessage')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2 border border-caption rounded-round-eight font-ui text-sm text-body"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex-1 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight active:scale-95 transition-all"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
