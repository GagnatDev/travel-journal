import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PhotobookOrderStatus,
  PublicUser,
  ShippingAddress,
  Trip,
} from '@travel-journal/shared';

import { fetchTripPhotobookPdf, startTripPhotobookPdfGeneration } from '../../api/trips.js';
import { createPhotobookOrder, fetchMyPhotobookOrder } from '../../api/photobookOrders.js';
import { AuthenticatedImage } from '../../components/AuthenticatedImage.js';
import { TextField } from '../../components/ui/TextField.js';

interface TripPhotobookPdfSectionProps {
  t: TFunction;
  trip: Trip;
  user: PublicUser;
  accessToken: string;
  /** i18next language code (`nb` | `en`) for PDF strings */
  pdfUiLanguage: string;
  refetchTrip: () => void;
}

/** Status badge palette: amber for in-flight/needs-attention, emerald for done, red for problems. */
const ORDER_STATUS_TONE: Record<PhotobookOrderStatus, string> = {
  requested:
    'text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60',
  awaiting_approval:
    'text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60',
  submitting:
    'text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60',
  submitted:
    'text-emerald-800 dark:text-emerald-200/90 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/50',
  failed:
    'text-red-800 dark:text-red-200/90 bg-red-50 dark:bg-red-950/40 border-red-200/80 dark:border-red-800/60',
  rejected:
    'text-red-800 dark:text-red-200/90 bg-red-50 dark:bg-red-950/40 border-red-200/80 dark:border-red-800/60',
  cancelled:
    'text-caption bg-bg-secondary border-caption/20',
};

type AddressDraft = {
  recipientName: string;
  email: string;
  phoneNumber: string;
  line1: string;
  line2: string;
  townOrCity: string;
  stateOrCounty: string;
  postalOrZipCode: string;
  countryCode: string;
};

function addressDraftFrom(address: ShippingAddress | undefined): AddressDraft {
  return {
    recipientName: address?.recipientName ?? '',
    email: address?.email ?? '',
    phoneNumber: address?.phoneNumber ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    townOrCity: address?.townOrCity ?? '',
    stateOrCounty: address?.stateOrCounty ?? '',
    postalOrZipCode: address?.postalOrZipCode ?? '',
    countryCode: address?.countryCode ?? '',
  };
}

function draftToShippingAddress(draft: AddressDraft): ShippingAddress {
  const address: ShippingAddress = {
    recipientName: draft.recipientName.trim(),
    line1: draft.line1.trim(),
    townOrCity: draft.townOrCity.trim(),
    postalOrZipCode: draft.postalOrZipCode.trim(),
    countryCode: draft.countryCode.trim(),
  };
  const email = draft.email.trim();
  const phoneNumber = draft.phoneNumber.trim();
  const line2 = draft.line2.trim();
  const stateOrCounty = draft.stateOrCounty.trim();
  if (email.length > 0) address.email = email;
  if (phoneNumber.length > 0) address.phoneNumber = phoneNumber;
  if (line2.length > 0) address.line2 = line2;
  if (stateOrCounty.length > 0) address.stateOrCounty = stateOrCounty;
  return address;
}

function addressDraftComplete(draft: AddressDraft): boolean {
  return (
    draft.recipientName.trim().length > 0 &&
    draft.line1.trim().length > 0 &&
    draft.townOrCity.trim().length > 0 &&
    draft.postalOrZipCode.trim().length > 0 &&
    draft.countryCode.trim().length > 0
  );
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
  user,
  accessToken,
  pdfUiLanguage,
  refetchTrip,
}: TripPhotobookPdfSectionProps) {
  const queryClient = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(() =>
    addressDraftFrom(user.shippingAddress),
  );
  const [saveAddressToProfile, setSaveAddressToProfile] = useState(false);
  const [copies, setCopies] = useState(1);

  const job = trip.photobookPdfJob;
  const status = job?.status;
  const isPending = status === 'pending';
  const isReady = status === 'ready';
  const isFailed = status === 'failed';

  const orderingEnabled = Boolean(user.photobookOrderingEnabled);
  const orderBlockEnabled = isReady && orderingEnabled;

  const orderQuery = useQuery({
    queryKey: ['photobook-order', trip.id],
    queryFn: () => fetchMyPhotobookOrder(trip.id, accessToken),
    enabled: orderBlockEnabled,
  });
  const existingOrder = orderQuery.data ?? null;
  // A cancelled order frees the user to start over.
  const hasActiveOrder = existingOrder !== null && existingOrder.status !== 'cancelled';

  const orderMutation = useMutation({
    mutationFn: async () => {
      setOrderError(null);
      return createPhotobookOrder(
        trip.id,
        {
          shippingAddress: draftToShippingAddress(addressDraft),
          copies,
          saveAddressToProfile,
        },
        accessToken,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['photobook-order', trip.id] });
    },
    onError: (err: Error) => {
      setOrderError(err.message || t('trips.settings.photobookOrder.orderError'));
    },
  });

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

      {orderBlockEnabled ? (
        <div className="mt-6 border-t border-caption/15 pt-5" data-testid="photobook-order-block">
          <h3 className="font-ui text-sm font-semibold text-heading mb-1">
            {hasActiveOrder
              ? t('trips.settings.photobookOrder.existingOrderTitle')
              : t('trips.settings.photobookOrder.title')}
          </h3>

          {orderQuery.isLoading ? (
            <p className="font-ui text-sm text-caption">{t('common.loading')}</p>
          ) : hasActiveOrder && existingOrder ? (
            <div className="space-y-2" data-testid="photobook-order-status">
              <span
                className={`inline-block font-ui text-xs font-semibold rounded-round-eight border px-2 py-1 ${ORDER_STATUS_TONE[existingOrder.status]}`}
                data-testid="photobook-order-status-badge"
              >
                {t(`trips.settings.photobookOrder.status.${existingOrder.status}`)}
              </span>
              {existingOrder.status === 'failed' && existingOrder.errorMessage ? (
                <p className="font-ui text-sm text-red-700 dark:text-red-300" role="alert">
                  {existingOrder.errorMessage}
                </p>
              ) : null}
              <p className="font-ui text-xs text-caption">
                {t('trips.settings.photobookOrder.manualStatusNote')}
              </p>
            </div>
          ) : (
            <form
              className="space-y-3"
              data-testid="photobook-order-form"
              onSubmit={(e) => {
                e.preventDefault();
                orderMutation.mutate();
              }}
            >
              <p className="font-ui text-sm text-body">
                {t('trips.settings.photobookOrder.description')}
              </p>
              <TextField
                label={t('trips.settings.photobookOrder.recipientName')}
                labelHtmlFor="order-recipient-name"
                value={addressDraft.recipientName}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, recipientName: e.target.value }))
                }
                required
              />
              <TextField
                label={t('trips.settings.photobookOrder.line1')}
                labelHtmlFor="order-line1"
                value={addressDraft.line1}
                onChange={(e) => setAddressDraft((d) => ({ ...d, line1: e.target.value }))}
                required
              />
              <TextField
                label={t('trips.settings.photobookOrder.line2')}
                labelHtmlFor="order-line2"
                value={addressDraft.line2}
                onChange={(e) => setAddressDraft((d) => ({ ...d, line2: e.target.value }))}
              />
              <TextField
                label={t('trips.settings.photobookOrder.townOrCity')}
                labelHtmlFor="order-town"
                value={addressDraft.townOrCity}
                onChange={(e) => setAddressDraft((d) => ({ ...d, townOrCity: e.target.value }))}
                required
              />
              <TextField
                label={t('trips.settings.photobookOrder.stateOrCounty')}
                labelHtmlFor="order-state"
                value={addressDraft.stateOrCounty}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, stateOrCounty: e.target.value }))
                }
              />
              <TextField
                label={t('trips.settings.photobookOrder.postalOrZipCode')}
                labelHtmlFor="order-postal"
                value={addressDraft.postalOrZipCode}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, postalOrZipCode: e.target.value }))
                }
                required
              />
              <TextField
                label={t('trips.settings.photobookOrder.countryCode')}
                labelHtmlFor="order-country"
                value={addressDraft.countryCode}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, countryCode: e.target.value }))
                }
                required
              />
              <TextField
                label={t('trips.settings.photobookOrder.email')}
                labelHtmlFor="order-email"
                type="email"
                value={addressDraft.email}
                onChange={(e) => setAddressDraft((d) => ({ ...d, email: e.target.value }))}
              />
              <TextField
                label={t('trips.settings.photobookOrder.phoneNumber')}
                labelHtmlFor="order-phone"
                value={addressDraft.phoneNumber}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, phoneNumber: e.target.value }))
                }
              />
              <TextField
                label={t('trips.settings.photobookOrder.copiesLabel')}
                labelHtmlFor="order-copies"
                type="number"
                min={1}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
              />
              <label className="flex items-center gap-2 font-ui text-sm text-body">
                <input
                  type="checkbox"
                  data-testid="photobook-order-save-address"
                  checked={saveAddressToProfile}
                  onChange={(e) => setSaveAddressToProfile(e.target.checked)}
                  className="h-4 w-4 rounded border-caption/40 text-accent focus:ring-accent"
                />
                {t('trips.settings.photobookOrder.saveAddressLabel')}
              </label>
              <p className="font-ui text-xs text-caption">
                {t('trips.settings.photobookOrder.manualStatusNote')}
              </p>
              {orderError ? (
                <p
                  className="font-ui text-sm text-accent"
                  role="alert"
                  data-testid="photobook-order-error"
                >
                  {orderError}
                </p>
              ) : null}
              <button
                type="submit"
                data-testid="photobook-order-submit"
                disabled={orderMutation.isPending || !addressDraftComplete(addressDraft)}
                className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                {orderMutation.isPending
                  ? t('common.loading')
                  : t('trips.settings.photobookOrder.orderButton')}
              </button>
            </form>
          )}
        </div>
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
