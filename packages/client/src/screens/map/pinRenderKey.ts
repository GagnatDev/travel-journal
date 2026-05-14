import type { MapRenderablePin } from './types.js';

export function pinsRenderKey(pins: MapRenderablePin[]): string {
  return pins
    .map((p) =>
      p.kind === 'pendingSavedLocation'
        ? `pending:${p.localId}:${p.createdAt}:${p.lat}:${p.lng}:${p.name ?? ''}`
        : `${p.kind}:${'id' in p ? String(p.id) : ''}:${'entryId' in p ? String(p.entryId) : ''}:${p.createdAt}:${p.lat}:${p.lng}:${'name' in p ? String(p.name ?? '') : ''}`,
    )
    .join('|');
}
