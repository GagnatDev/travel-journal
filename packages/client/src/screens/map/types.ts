import type { MapPin } from '@travel-journal/shared';

export type MapRenderablePin =
  | MapPin
  | {
      kind: 'pendingSavedLocation';
      localId: string;
      lat: number;
      lng: number;
      createdAt: string;
      name?: string;
    };

export function getPinSortTime(pin: MapRenderablePin): number {
  return new Date(pin.createdAt).getTime();
}
