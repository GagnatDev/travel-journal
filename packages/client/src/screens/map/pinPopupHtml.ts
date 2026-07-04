import type { TFunction } from 'i18next';

import type { MapRenderablePin } from './types.js';
import { escapeHtml } from './utils/escapeHtml.js';

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
    return `<div style="font-family:sans-serif;min-width:180px;padding:4px 0">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${escapeHtml(pin.title)}</div>
          <div style="font-size:12px;color:#666;margin-bottom:8px">${dateFormatted}</div>
          <a
            href="/trips/${tripId}/timeline"
            data-entry-id="${escapeHtml(pin.entryId)}"
            style="font-size:12px;color:#9b3f2b;text-decoration:underline;cursor:pointer"
          >${escapeHtml(t('map.viewEntry'))}</a>
        </div>`;
  }

  if (pin.kind === 'pendingSavedLocation') {
    const label = pin.name?.trim()
      ? escapeHtml(pin.name)
      : `<span style="font-style:italic">${escapeHtml(t('map.savedLocationUntitled'))}</span>`;
    return `<div style="font-family:sans-serif;min-width:180px;padding:4px 0">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${label}</div>
          <div style="font-size:11px;color:#92400e;margin-bottom:8px;line-height:1.35">${escapeHtml(t('map.pendingSpotOffline'))}</div>
          <div style="font-size:12px;color:#666;margin-bottom:8px">${dateFormatted}</div>
          ${
            canManageSaved
              ? `<button type="button" data-delete-pending-saved="${escapeHtml(pin.localId)}" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;padding:0">${escapeHtml(t('map.discardPendingSpot'))}</button>`
              : ''
          }
        </div>`;
  }

  const label = pin.name?.trim()
    ? escapeHtml(pin.name)
    : `<span style="font-style:italic">${escapeHtml(t('map.savedLocationUntitled'))}</span>`;

  const isFavorite = pin.isFavorite === true;

  const favoriteBadge = isFavorite
    ? `<div style="font-size:11px;color:#b45309;margin-bottom:4px">★ ${escapeHtml(t('map.favoriteLocationBadge'))}</div>`
    : '';

  const deleteBtn = canManageSaved
    ? `<button type="button" data-delete-saved="${escapeHtml(pin.id)}" ${isFavorite ? 'data-delete-saved-favorite="true"' : ''} style="margin-top:6px;font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;padding:0">${escapeHtml(t(isFavorite ? 'map.removeFavoriteLocation' : 'map.deleteSavedLocation'))}</button>`
    : '';

  return `<div style="font-family:sans-serif;min-width:180px;padding:4px 0">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${label}</div>
          ${favoriteBadge}
          <div style="font-size:11px;color:#666;margin-bottom:4px">${escapeHtml(t('map.savedBy'))} ${escapeHtml(pin.savedByDisplayName)}</div>
          <div style="font-size:12px;color:#666;margin-bottom:8px">${dateFormatted}</div>
          <button type="button" data-compose-from-saved="${escapeHtml(pin.id)}" data-lat="${String(pin.lat)}" data-lng="${String(pin.lng)}" ${isFavorite ? 'data-pin-favorite="true"' : ''} ${pin.name?.trim() ? `data-pin-name="${escapeHtml(pin.name.trim())}"` : ''}
            style="display:block;margin-bottom:6px;font-size:12px;color:#2563eb;text-decoration:underline;background:none;border:none;padding:0;cursor:pointer;text-align:left"
          >${escapeHtml(t('map.createEntryFromSaved'))}</button>
          ${deleteBtn}
        </div>`;
}
