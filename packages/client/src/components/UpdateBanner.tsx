import { useTranslation } from 'react-i18next';

import { hasUnsavedChanges } from '../lib/unsavedChanges.js';
import { usePwaUpdate } from '../pwa/usePwaUpdate.js';

/**
 * Banner offering to activate a waiting service-worker update. Renders
 * nothing while no update is pending.
 *
 * This must stay reachable OUTSIDE the authenticated UI (it renders on the
 * login screen as well as in the notifications panel): behind the
 * homectl-auth forward-auth sidecar every request — including the `sw.js`
 * update check — fails while logged out, so a logged-out client whose only
 * update UI sits behind the auth gate would stay pinned to a stale (and
 * possibly broken) build with no way to apply the fix that is already
 * installed and waiting. See docs/auth-sidecar-migration.md.
 */
export function UpdateBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { updateAvailable, applyUpdate } = usePwaUpdate();

  if (!updateAvailable) return null;

  const handleUpdateNow = () => {
    // A reload would discard in-progress work (e.g. a half-written entry), so
    // confirm first when something is unsaved. "Later" is just leaving it be.
    if (hasUnsavedChanges() && !window.confirm(t('update.unsavedConfirm'))) return;
    applyUpdate();
  };

  return (
    <div
      className={`rounded-lg border border-accent/40 bg-accent/10 px-3 py-3 space-y-2${className ? ` ${className}` : ''}`}
      data-testid="update-banner"
    >
      <h3 className="font-ui font-semibold text-heading text-sm">{t('update.bannerTitle')}</h3>
      <p className="text-body text-xs">{t('update.bannerBody')}</p>
      <button
        type="button"
        onClick={handleUpdateNow}
        data-testid="update-now"
        className="w-full font-ui text-sm font-medium px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent/80 transition-colors"
      >
        {t('update.now')}
      </button>
    </div>
  );
}
