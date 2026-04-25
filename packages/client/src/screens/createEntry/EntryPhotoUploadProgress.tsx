import { useTranslation } from 'react-i18next';

export type EntryUploadProgress = {
  completed: number;
  total: number;
  phase: 'adding' | 'finishing';
};

export function EntryPhotoUploadProgress({ progress }: { progress: EntryUploadProgress }) {
  const { t } = useTranslation();
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0;
  const titleKey =
    progress.phase === 'finishing' ? 'entries.uploadFinishingTitle' : 'entries.uploadingPhotosTitle';

  return (
    <div
      className="w-full rounded-round-eight border border-accent/40 bg-bg-primary/95 px-4 py-3 shadow-sm backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy={progress.completed < progress.total}
      data-testid="entry-photo-upload-progress"
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-block size-5 shrink-0 rounded-full border-2 border-caption/25 border-t-accent animate-spin"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-sm font-semibold text-heading">{t(titleKey)}</p>
          <p className="font-ui text-xs text-caption mt-0.5">
            {t('entries.uploadProgressCount', {
              completed: progress.completed,
              total: progress.total,
            })}
          </p>
        </div>
      </div>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-caption/15"
        role="progressbar"
        aria-valuenow={progress.completed}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-label={t('entries.uploadProgressCount', {
          completed: progress.completed,
          total: progress.total,
        })}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
