import { useTranslation } from 'react-i18next';

import { mapboxTokenMissingBodyKey } from '../mapboxTokenMissingBodyKey.js';

type MapScreenOverlaysProps = {
  hasMapboxToken: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  showEmptyPins: boolean;
  onRetry: () => void;
};

export function MapScreenOverlays({
  hasMapboxToken,
  isLoading,
  isError,
  isFetching,
  showEmptyPins,
  onRetry,
}: MapScreenOverlaysProps) {
  const { t } = useTranslation();

  return (
    <>
      {!hasMapboxToken && (
        <div
          role="alert"
          className="absolute top-3 left-3 right-3 z-20 rounded-xl border border-yellow-300 bg-yellow-100 px-4 py-3 font-ui text-sm text-yellow-950 shadow-md dark:border-yellow-700 dark:bg-yellow-950/90 dark:text-yellow-50"
        >
          <p className="font-semibold text-heading">{t('map.mapboxTokenMissingTitle')}</p>
          <p className="mt-1 text-caption leading-snug">{t(mapboxTokenMissingBodyKey())}</p>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80">
          <span className="font-ui text-caption text-sm">{t('common.loading')}</span>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg-primary/80 px-6">
          <span className="font-ui text-caption text-sm text-center">{t('common.error')}</span>
          <button
            type="button"
            disabled={isFetching}
            onClick={onRetry}
            className="font-ui text-sm rounded-lg border border-caption/30 bg-bg-secondary px-4 py-2 text-body hover:border-accent/40 disabled:opacity-50"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {showEmptyPins && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-bg-primary/90 rounded-xl px-6 py-4 shadow-md text-center max-w-sm">
            <p className="font-ui text-caption text-sm">{t('map.noPins')}</p>
          </div>
        </div>
      )}
    </>
  );
}
