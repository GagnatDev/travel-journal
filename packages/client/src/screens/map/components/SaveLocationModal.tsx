import { useTranslation } from 'react-i18next';

type SaveLocationModalProps = {
  open: boolean;
  name: string;
  onNameChange: (value: string) => void;
  errorKey: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function SaveLocationModal({
  open,
  name,
  onNameChange,
  errorKey,
  busy,
  onClose,
  onConfirm,
}: SaveLocationModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="save-location-title"
        className="w-full max-w-sm rounded-xl border border-caption/20 bg-bg-primary p-4 shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="save-location-title" className="font-ui font-semibold text-heading">
          {t('map.saveLocationTitle')}
        </h2>
        <p className="mt-2 text-sm text-caption font-ui">{t('map.saveLocationHint')}</p>
        {navigator.onLine === false && (
          <p className="mt-2 text-xs text-caption font-ui">{t('map.saveLocationOfflineNote')}</p>
        )}
        <label className="mt-4 block font-ui text-sm text-body" htmlFor="save-location-name">
          {t('map.saveLocationNameLabel')}
        </label>
        <input
          id="save-location-name"
          type="text"
          value={name}
          disabled={busy}
          maxLength={500}
          onChange={(ev) => onNameChange(ev.target.value)}
          placeholder={t('map.saveLocationNamePlaceholder')}
          className="mt-1 w-full rounded-lg border border-caption/25 bg-bg-secondary px-3 py-2 text-sm font-ui text-body outline-none focus:border-accent/60"
        />
        {errorKey !== null ? (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300 font-ui">{t(errorKey)}</p>
        ) : null}
        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            disabled={busy}
            className="font-ui rounded-lg border border-caption/25 px-3 py-2 text-sm text-body hover:bg-bg-secondary disabled:opacity-50"
            onClick={() => onClose()}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            className="font-ui rounded-lg bg-accent px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            onClick={() => onConfirm()}
          >
            {busy ? t('common.loading') : t('map.saveLocationConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
