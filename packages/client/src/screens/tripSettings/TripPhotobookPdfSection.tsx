import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import { useMutation } from '@tanstack/react-query';
import type { Trip } from '@travel-journal/shared';

import { fetchTripPhotobookPdf, startTripPhotobookPdfGeneration } from '../../api/trips.js';
import { AuthenticatedImage } from '../../components/AuthenticatedImage.js';

interface TripPhotobookPdfSectionProps {
  t: TFunction;
  trip: Trip;
  accessToken: string;
  /** i18next language code (`nb` | `en`) for PDF strings */
  pdfUiLanguage: string;
  refetchTrip: () => void;
}

function sanitizeFilenamePart(name: string): string {
  return name.replace(/[^\w\s-]/g, '').trim().slice(0, 80) || 'trip';
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function TripPhotobookPdfSection({
  t,
  trip,
  accessToken,
  pdfUiLanguage,
  refetchTrip,
}: TripPhotobookPdfSectionProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);

  const job = trip.photobookPdfJob;
  const status = job?.status;
  const isPending = status === 'pending';
  const isReady = status === 'ready';
  const isFailed = status === 'failed';

  useEffect(() => {
    if (!isPending) return;
    const id = window.setInterval(() => {
      refetchTrip();
    }, 2000);
    return () => window.clearInterval(id);
  }, [isPending, refetchTrip]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      setLocalError(null);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return startTripPhotobookPdfGeneration(trip.id, accessToken, {
        locale: pdfUiLanguage,
        timeZone: tz,
      });
    },
    onSuccess: () => {
      refetchTrip();
    },
    onError: (err: Error) => {
      setLocalError(err.message || t('trips.settings.photobookPdfError'));
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      setLocalError(null);
      const blob = await fetchTripPhotobookPdf(trip.id, accessToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilenamePart(trip.name)}-photobook.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (err: Error) => {
      setLocalError(err.message || t('trips.settings.photobookPdfError'));
    },
  });

  const coverKey = trip.photobookCoverImageKey?.trim();
  const hasChosenCover = Boolean(coverKey);

  const jobError = isFailed && job?.errorMessage ? job.errorMessage : null;
  const errorMessage = localError ?? jobError;

  return (
    <section>
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
        {t('trips.settings.photobookPdfTitle')}
      </h2>
      <p className="font-ui text-sm text-body mb-3">{t('trips.settings.photobookPdfDescription')}</p>

      {!hasChosenCover ? (
        <p
          className="font-ui text-sm text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-round-eight px-3 py-2 mb-3"
          role="status"
          data-testid="photobook-cover-warning"
        >
          {t('trips.settings.photobookCoverNotChosenWarning')}
        </p>
      ) : (
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            data-testid="photobook-cover-preview-open"
            onClick={() => setCoverPreviewOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-round-eight border border-caption/25 text-heading bg-bg-secondary hover:bg-bg-tertiary transition-colors"
            aria-label={t('trips.settings.photobookCoverPreviewOpen')}
          >
            <EyeIcon />
          </button>
          <span className="font-ui text-xs text-caption">{t('trips.settings.photobookCoverPreviewHint')}</span>
        </div>
      )}

      {isPending ? (
        <p
          className="font-ui text-sm text-body bg-bg-secondary border border-caption/20 rounded-round-eight px-3 py-2 mb-3"
          role="status"
          data-testid="photobook-pdf-pending"
        >
          {t('trips.settings.photobookPdfGenerating')}
        </p>
      ) : null}

      {isReady ? (
        <p
          className="font-ui text-sm text-body bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 rounded-round-eight px-3 py-2 mb-3"
          role="status"
          data-testid="photobook-pdf-ready"
        >
          {t('trips.settings.photobookPdfReadyMessage')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!isPending ? (
          <button
            type="button"
            data-testid="photobook-generate-or-regenerate"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {generateMutation.isPending
              ? t('common.loading')
              : isReady
                ? t('trips.settings.photobookPdfRegenerateButton')
                : t('trips.settings.photobookPdfGenerateButton')}
          </button>
        ) : null}
        {isReady ? (
          <button
            type="button"
            data-testid="photobook-download-pdf"
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
            className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent/10 active:scale-95 transition-all disabled:opacity-50"
          >
            {downloadMutation.isPending ? t('common.loading') : t('trips.settings.photobookPdfDownloadLink')}
          </button>
        ) : null}
      </div>
      {errorMessage ? (
        <p className="mt-2 font-ui text-sm text-accent" role="alert" data-testid="photobook-pdf-error">
          {errorMessage}
        </p>
      ) : null}

      {coverPreviewOpen && coverKey
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
              role="dialog"
              aria-modal="true"
              aria-label={t('trips.settings.photobookCoverPreviewDialogLabel')}
            >
              <button
                type="button"
                aria-label={t('common.close')}
                className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
                onClick={() => setCoverPreviewOpen(false)}
              >
                {t('common.close')}
              </button>
              <div className="max-h-[85vh] max-w-[min(100%,42rem)] w-full flex flex-col items-center gap-3">
                <AuthenticatedImage
                  mediaKey={coverKey}
                  alt={t('trips.settings.photobookCoverPreviewImageAlt')}
                  loading="eager"
                  className="h-[min(75vh,52rem)] w-full min-h-[12rem] object-contain"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
