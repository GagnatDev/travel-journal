import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TripEntryNotificationMode } from '@travel-journal/shared';

import { useTripNotificationModeMutation } from '../../notifications/useTripNotificationModeMutation.js';
import { BellIcon } from '../icons/index.js';

interface TripNotificationModeControlProps {
  tripId: string;
  /**
   * Current mode from the trip member record. When undefined (still loading
   * or a legacy record without the new field), the control defaults to
   * `per_entry` since that matches the previous legacy default.
   */
  currentMode: TripEntryNotificationMode | undefined;
}

const MODE_OPTIONS: TripEntryNotificationMode[] = ['per_entry', 'daily_digest', 'off'];

const MODE_I18N_KEY: Record<TripEntryNotificationMode, string> = {
  per_entry: 'trips.notificationMode.perEntry',
  daily_digest: 'trips.notificationMode.dailyDigest',
  off: 'trips.notificationMode.off',
};

/**
 * Per-trip new-entry notification control, shown in the Timeline header next
 * to the story-mode toggle. Opens a popover with three radio options, so
 * followers — who cannot reach the trip settings screen — still have a
 * discoverable place to tune their preference for this trip.
 */
export function TripNotificationModeControl({
  tripId,
  currentMode,
}: TripNotificationModeControlProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useTripNotificationModeMutation({ tripId });

  const effectiveMode: TripEntryNotificationMode = currentMode ?? 'per_entry';

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  async function handleSelect(nextMode: TripEntryNotificationMode) {
    if (nextMode === effectiveMode) {
      setOpen(false);
      return;
    }
    setErrorMessage(null);
    try {
      await mutation.mutateAsync(nextMode);
      setOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const activeLabel = t(MODE_I18N_KEY[effectiveMode]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('trips.notificationMode.triggerLabel', { current: activeLabel })}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="trip-notification-mode-trigger"
        onClick={() => setOpen((prev) => !prev)}
        className={`p-2 rounded-full transition-colors ${
          effectiveMode === 'off'
            ? 'text-caption hover:text-heading'
            : 'bg-accent/10 text-accent'
        }`}
      >
        <BellIcon width={20} height={20} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          data-testid="trip-notification-mode-popover"
          className="absolute right-0 mt-2 w-64 rounded-lg border border-caption/10 bg-bg-primary shadow-lg p-2 z-50"
        >
          <p className="font-ui text-xs text-caption px-2 pb-1">
            {t('trips.notificationMode.popoverTitle')}
          </p>
          <ul className="space-y-1">
            {MODE_OPTIONS.map((mode) => {
              const selected = mode === effectiveMode;
              return (
                <li key={mode}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    disabled={mutation.isPending}
                    data-testid={`trip-notification-mode-option-${mode}`}
                    onClick={() => {
                      void handleSelect(mode);
                    }}
                    className={`w-full text-left px-2 py-2 rounded-md font-ui text-sm flex items-start gap-2 ${
                      selected ? 'bg-accent/10 text-heading' : 'hover:bg-bg-secondary text-body'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${
                        selected ? 'bg-accent' : 'bg-caption/40'
                      }`}
                    />
                    <span className="flex-1">
                      <span className="block font-medium">{t(MODE_I18N_KEY[mode])}</span>
                      <span className="block text-xs text-caption mt-0.5">
                        {t(`${MODE_I18N_KEY[mode]}Description`)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {errorMessage && (
            <p role="alert" className="font-ui text-xs text-red-600 px-2 pt-2">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
