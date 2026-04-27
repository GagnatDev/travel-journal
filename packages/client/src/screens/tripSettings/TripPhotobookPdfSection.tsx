import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useMutation } from '@tanstack/react-query';
import type { Trip } from '@travel-journal/shared';

import { fetchTripPhotobookPdf } from '../../api/trips.js';

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

export function TripPhotobookPdfSection({ t, trip, accessToken, pdfUiLanguage }: TripPhotobookPdfSectionProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  return (
    <section>
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
        {t('trips.settings.photobookPdfTitle')}
      </h2>
      <p className="font-ui text-sm text-body mb-3">{t('trips.settings.photobookPdfDescription')}</p>
      <button
        type="button"
        onClick={() => downloadMutation.mutate()}
        disabled={downloadMutation.isPending}
        className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
      >
        {downloadMutation.isPending ? t('common.loading') : t('trips.settings.photobookPdfButton')}
      </button>
      {errorMessage ? (
        <p className="mt-2 font-ui text-sm text-accent" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
