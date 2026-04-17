import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface DeleteEntryConfirmDialogProps {
  open: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteEntryConfirmDialog({
  open,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteEntryConfirmDialogProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLButtonElement>('[data-delete-entry-dialog-cancel]')
        ?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) {
        prev.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isDeleting, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-heading/40"
      role="presentation"
      onClick={() => {
        if (!isDeleting) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="w-full sm:max-w-md bg-bg-primary rounded-t-2xl sm:rounded-2xl p-6 shadow-xl border border-caption/20"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-entry-dialog-title"
        data-testid="delete-entry-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-entry-dialog-title" className="font-display text-xl text-heading mb-6">
          {t('entries.deleteConfirm')}
        </h2>
        <div className="flex gap-3">
          <button
            type="button"
            data-delete-entry-dialog-cancel
            disabled={isDeleting}
            onClick={onCancel}
            className="flex-1 py-2.5 border border-caption rounded-round-eight font-ui font-semibold text-body hover:bg-bg-secondary active:scale-95 transition-all disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-red-600 text-white font-ui font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {isDeleting ? t('common.loading') : t('entries.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
