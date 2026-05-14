import { type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { GearIcon } from '../../../components/icons/index.js';

type MapSettingsMenuProps = {
  visible: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  menuRef: RefObject<HTMLDivElement>;
  buttonRef: RefObject<HTMLButtonElement>;
  offlineQueuedFlash: boolean;
  onSaveCurrentLocation: () => void;
  onGoToMyLocation: () => void;
};

export function MapSettingsMenu({
  visible,
  menuOpen,
  onToggleMenu,
  menuRef,
  buttonRef,
  offlineQueuedFlash,
  onSaveCurrentLocation,
  onGoToMyLocation,
}: MapSettingsMenuProps) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 md:right-14 flex flex-col items-end gap-2">
      {offlineQueuedFlash && (
        <div
          role="status"
          className="font-ui max-w-[14rem] rounded-lg border border-green-700/40 bg-green-950/85 px-3 py-2 text-xs leading-snug text-green-50 shadow-md"
        >
          {t('offline.savedSpotQueued')}
        </div>
      )}
      <div className="relative" ref={menuRef}>
        <button
          ref={buttonRef}
          type="button"
          onClick={onToggleMenu}
          aria-label={t('map.openMenu')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="grid place-items-center rounded-full border border-caption/25 bg-bg-primary/95 p-3 text-body shadow-md hover:bg-bg-secondary backdrop-blur-sm"
        >
          <GearIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 min-w-[14rem] rounded-lg border border-caption/10 bg-bg-primary shadow-lg py-1 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="font-ui flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-body hover:bg-bg-secondary"
              onClick={onSaveCurrentLocation}
            >
              {t('map.saveCurrentLocation')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="font-ui flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-body hover:bg-bg-secondary"
              onClick={onGoToMyLocation}
            >
              {t('map.goToMyLocation')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
