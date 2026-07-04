import type { TFunction } from 'i18next';

import type { MapRenderablePin } from './types.js';
import { escapeHtml } from './utils/escapeHtml.js';

const CTA_ARROW = '<span class="tj-popup-cta__arrow" aria-hidden="true">&rarr;</span>';

export function buildPinPopupHtml(
  pin: MapRenderablePin,
  tripId: string | undefined,
  t: TFunction,
  canManageSaved: boolean,
): string {
  const dateFormatted = new Date(pin.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (pin.kind === 'entry') {
    return `<div class="tj-popup">
          <div class="tj-popup__title">${escapeHtml(pin.title)}</div>
          <div class="tj-popup__meta">${dateFormatted}</div>
          <div class="tj-popup__actions">
            <a
              href="/trips/${tripId}/timeline"
              data-popup-entry-id="${escapeHtml(pin.entryId)}"
              class="tj-popup-cta"
            >${escapeHtml(t('map.viewEntry'))}${CTA_ARROW}</a>
          </div>
        </div>`;
  }

  if (pin.kind === 'pendingSavedLocation') {
    const label = pin.name?.trim()
      ? escapeHtml(pin.name)
      : `<span class="tj-popup__untitled">${escapeHtml(t('map.savedLocationUntitled'))}</span>`;
    return `<div class="tj-popup">
          <div class="tj-popup__title">${label}</div>
          <div class="tj-popup__note">${escapeHtml(t('map.pendingSpotOffline'))}</div>
          <div class="tj-popup__meta">${dateFormatted}</div>
          ${
            canManageSaved
              ? `<div class="tj-popup__actions"><button type="button" data-delete-pending-saved="${escapeHtml(pin.localId)}" class="tj-popup-danger">${escapeHtml(t('map.discardPendingSpot'))}</button></div>`
              : ''
          }
        </div>`;
  }

  const label = pin.name?.trim()
    ? escapeHtml(pin.name)
    : `<span class="tj-popup__untitled">${escapeHtml(t('map.savedLocationUntitled'))}</span>`;

  const isFavorite = pin.isFavorite === true;

  const favoriteBadge = isFavorite
    ? `<div class="tj-popup__badge">&#9733; ${escapeHtml(t('map.favoriteLocationBadge'))}</div>`
    : '';

  const deleteBtn = canManageSaved
    ? `<button type="button" data-delete-saved="${escapeHtml(pin.id)}" ${isFavorite ? 'data-delete-saved-favorite="true"' : ''} class="tj-popup-danger">${escapeHtml(t(isFavorite ? 'map.removeFavoriteLocation' : 'map.deleteSavedLocation'))}</button>`
    : '';

  return `<div class="tj-popup">
          <div class="tj-popup__title">${label}</div>
          ${favoriteBadge}
          <div class="tj-popup__meta">${escapeHtml(t('map.savedBy'))} ${escapeHtml(pin.savedByDisplayName)}<br>${dateFormatted}</div>
          <div class="tj-popup__actions">
            <button type="button" data-compose-from-saved="${escapeHtml(pin.id)}" data-lat="${String(pin.lat)}" data-lng="${String(pin.lng)}" ${isFavorite ? 'data-pin-favorite="true"' : ''} ${pin.name?.trim() ? `data-pin-name="${escapeHtml(pin.name.trim())}"` : ''}
              class="tj-popup-cta"
            >${escapeHtml(t('map.createEntryFromSaved'))}${CTA_ARROW}</button>
            ${deleteBtn}
          </div>
        </div>`;
}
