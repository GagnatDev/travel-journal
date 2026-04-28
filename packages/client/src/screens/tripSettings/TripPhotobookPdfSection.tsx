import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import { useMutation } from '@tanstack/react-query';
import type { Trip } from '@travel-journal/shared';

import { fetchTripPhotobookPdf } from '../../api/trips.js';
import { AuthenticatedImage } from '../../components/AuthenticatedImage.js';

interface TripPhotobookPdfSectionProps {
  t: TFunction;
  trip: Trip;
  accessToken: string;
  /** i18next language code (`nb` | `en`) for PDF strings */
  pdfUiLanguage: string;
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

export function TripPhotobookPdfSection({ t, trip, accessToken, pdfUiLanguage }: TripPhotobookPdfSectionProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);

  const downloadMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      const blob = await fetchTripPhotobookPdf(trip.id, accessToken, { locale: pdfUiLanguage });
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
      setErrorMessage(err.message || t('trips.settings.photobookPdfError'));
    },
  });

  const coverKey = trip.photobookCoverImageKey?.trim();
  const hasChosenCover = Boolean(coverKey);

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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => downloadMutation.mutate()}
          disabled={downloadMutation.isPending}
          className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {downloadMutation.isPending ? t('common.loading') : t('trips.settings.photobookPdfButton')}
        </button>
      </div>
      {errorMessage ? (
        <p className="mt-2 font-ui text-sm text-accent" role="alert">
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
                  className="max-h-[75vh] w-full object-contain"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
