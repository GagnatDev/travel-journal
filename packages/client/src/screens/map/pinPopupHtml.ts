import type { TFunction } from 'i18next';

import type { MapRenderablePin } from './types.js';
import { escapeHtml } from './utils/escapeHtml.js';

const CTA_ARROW = '<span class="tj-popup-cta__arrow" aria-hidden="true">&rarr;</span>';

function buildPinPopupInnerHtml(
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
    return `<div class="tj-popup__title">${escapeHtml(pin.title)}</div>
          <div class="tj-popup__meta">${dateFormatted}</div>
          <div class="tj-popup__actions">
            <a
              href="/trips/${tripId}/timeline"
              data-popup-entry-id="${escapeHtml(pin.entryId)}"
              class="tj-popup-cta"
            >${escapeHtml(t('map.viewEntry'))}${CTA_ARROW}</a>
          </div>`;
  }

  if (pin.kind === 'pendingSavedLocation') {
    const label = pin.name?.trim()
      ? escapeHtml(pin.name)
      : `<span class="tj-popup__untitled">${escapeHtml(t('map.savedLocationUntitled'))}</span>`;
    return `<div class="tj-popup__title">${label}</div>
          <div class="tj-popup__note">${escapeHtml(t('map.pendingSpotOffline'))}</div>
          <div class="tj-popup__meta">${dateFormatted}</div>
          ${
            canManageSaved
              ? `<div class="tj-popup__actions"><button type="button" data-delete-pending-saved="${escapeHtml(pin.localId)}" class="tj-popup-danger">${escapeHtml(t('map.discardPendingSpot'))}</button></div>`
              : ''
          }`;
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

  return `<div class="tj-popup__title">${label}</div>
          ${favoriteBadge}
          <div class="tj-popup__meta">${escapeHtml(t('map.savedBy'))} ${escapeHtml(pin.savedByDisplayName)}<br>${dateFormatted}</div>
          <div class="tj-popup__actions">
            <button type="button" data-compose-from-saved="${escapeHtml(pin.id)}" data-lat="${String(pin.lat)}" data-lng="${String(pin.lng)}" ${isFavorite ? 'data-pin-favorite="true"' : ''} ${pin.name?.trim() ? `data-pin-name="${escapeHtml(pin.name.trim())}"` : ''}
              class="tj-popup-cta"
            >${escapeHtml(t('map.createEntryFromSaved'))}${CTA_ARROW}</button>
            ${deleteBtn}
          </div>`;
}

export function buildPinPopupHtml(
  pin: MapRenderablePin,
  tripId: string | undefined,
  t: TFunction,
  canManageSaved: boolean,
): string {
  return `<div class="tj-popup">${buildPinPopupInnerHtml(pin, tripId, t, canManageSaved)}</div>`;
}

/**
 * Popup for a cluster of overlapping pins: one pin visible at a time, with
 * prev/next buttons and a counter. Paging is handled by the document-level
 * click handler in useMapboxMap (data-cluster-nav) — no framework state.
 */
export function buildClusterPopupHtml(
  pins: MapRenderablePin[],
  tripId: string | undefined,
  t: TFunction,
  canManageSaved: boolean,
): string {
  const items = pins
    .map(
      (pin, i) =>
        `<div class="tj-cluster-item" data-cluster-item="${i}"${i === 0 ? '' : ' hidden'}>${buildPinPopupInnerHtml(pin, tripId, t, canManageSaved)}</div>`,
    )
    .join('');

  return `<div class="tj-popup tj-popup--cluster" data-cluster-size="${pins.length}">
          <div class="tj-cluster-nav">
            <button type="button" class="tj-cluster-nav__btn" data-cluster-nav="prev" aria-label="${escapeHtml(t('map.clusterPrev'))}">&lsaquo;</button>
            <span class="tj-cluster-nav__counter" data-cluster-counter aria-live="polite">1 / ${pins.length}</span>
            <button type="button" class="tj-cluster-nav__btn" data-cluster-nav="next" aria-label="${escapeHtml(t('map.clusterNext'))}">&rsaquo;</button>
          </div>
          ${items}
        </div>`;
}
