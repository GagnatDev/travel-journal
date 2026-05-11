import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { TFunction } from 'i18next';
import mapboxgl from 'mapbox-gl';
import type { ComposeFromSavedLocationPayload } from '@travel-journal/shared';

import { deleteSavedLocation } from '../../../api/savedLocations.js';
import { removePendingSavedLocationFromQueue } from '../../../offline/savedLocationSync.js';

export type MapScreenMapActions = {
  navigate: NavigateFunction;
  t: TFunction;
  tripId: string;
  accessToken: string;
  invalidateMapPins: () => Promise<void>;
};

export type MapboxMapRefsBundle = {
  mapContainerRef: RefObject<HTMLDivElement>;
  mapRef: MutableRefObject<mapboxgl.Map | null>;
  markersRef: MutableRefObject<mapboxgl.Marker[]>;
  lastRenderedPinKeyRef: MutableRefObject<string>;
  didInitialFitRef: MutableRefObject<boolean>;
};

export function useMapboxMap(
  mapActionsRef: MutableRefObject<MapScreenMapActions>,
): MapboxMapRefsBundle & { mapReady: boolean; hasMapboxToken: boolean } {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const lastRenderedPinKeyRef = useRef('');
  const didInitialFitRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const hasMapboxToken = Boolean(import.meta.env.VITE_MAPBOX_TOKEN?.trim());

  useEffect(() => {
    if (!mapContainerRef.current || !hasMapboxToken) return;
    if (mapRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN!.trim();
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [20, 0],
      zoom: 1,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      setMapReady(true);
    });

    function handlePopupClick(e: MouseEvent): void {
      const target = e.target as HTMLElement;

      const pendDelEl = target.closest('[data-delete-pending-saved]') as HTMLElement | null;
      if (pendDelEl?.dataset['deletePendingSaved']) {
        e.preventDefault();
        const localId = pendDelEl.dataset['deletePendingSaved']!;
        void (async (): Promise<void> => {
          await removePendingSavedLocationFromQueue(localId);
        })();
        return;
      }

      const deleteBtnEl = target.closest('[data-delete-saved]') as HTMLElement | null;
      if (deleteBtnEl?.dataset['deleteSaved']) {
        e.preventDefault();
        const sid = deleteBtnEl.dataset['deleteSaved']!;
        const { tripId: tid, accessToken: tok, invalidateMapPins: invalidate, t: tt } =
          mapActionsRef.current;

        void (async (): Promise<void> => {
          if (!window.confirm(tt('map.confirmDeleteSavedLocation'))) return;
          try {
            await deleteSavedLocation(tid, sid, tok);
            await invalidate();
          } catch {
            // Silent — user may retry by reopening popup
          }
        })();

        return;
      }

      const composeBtn = target.closest('[data-compose-from-saved]') as HTMLElement | null;
      if (composeBtn?.dataset['composeFromSaved']) {
        e.preventDefault();
        const { navigate: nv, tripId: tid } = mapActionsRef.current;
        const savedLocationId = composeBtn.dataset['composeFromSaved']!;
        const lat = Number(composeBtn.dataset['lat']);
        const lng = Number(composeBtn.dataset['lng']);
        const nm = composeBtn.dataset['pinName'];

        const payload: ComposeFromSavedLocationPayload = {
          savedLocationId,
          lat,
          lng,
          ...(nm?.trim() && { name: nm.trim() }),
        };

        nv(`/trips/${tid}/entries/new`, { state: { fromSavedLocation: payload } });
        return;
      }

      const anchor = target.closest('a[data-entry-id]') as HTMLAnchorElement | null;
      if (!anchor) return;
      e.preventDefault();
      const entryId = anchor.dataset['entryId'];
      const { navigate: nv, tripId: tid } = mapActionsRef.current;
      nv(`/trips/${tid}/timeline`, { state: { highlightEntryId: entryId } });
    }
    document.addEventListener('click', handlePopupClick);

    return () => {
      document.removeEventListener('click', handlePopupClick);
      markersRef.current.forEach((m) => {
        (m as unknown as { remove?: () => void }).remove?.();
      });
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      lastRenderedPinKeyRef.current = '';
      didInitialFitRef.current = false;
      setMapReady(false);
    };
  }, [hasMapboxToken]);

  return {
    mapContainerRef,
    mapRef,
    markersRef,
    lastRenderedPinKeyRef,
    didInitialFitRef,
    mapReady,
    hasMapboxToken,
  };
}
