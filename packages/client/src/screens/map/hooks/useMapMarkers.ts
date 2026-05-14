import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import mapboxgl from 'mapbox-gl';

import { buildPinPopupHtml } from '../pinPopupHtml.js';
import { pinsRenderKey } from '../pinRenderKey.js';
import { createMarkerElementForPin } from '../createMarkerElementForPin.js';
import type { MapRenderablePin } from '../types.js';
import type { MapboxMapRefsBundle } from './useMapboxMap.js';

type UseMapMarkersArgs = Pick<
  MapboxMapRefsBundle,
  'mapRef' | 'markersRef' | 'lastRenderedPinKeyRef' | 'didInitialFitRef'
> & {
  mapReady: boolean;
  pinsForMap: MapRenderablePin[];
  isLoading: boolean;
  isError: boolean;
  hasMapboxToken: boolean;
  tripId: string | undefined;
  t: TFunction;
  canManageSaved: boolean;
};

export function useMapMarkers({
  mapRef,
  markersRef,
  lastRenderedPinKeyRef,
  didInitialFitRef,
  mapReady,
  pinsForMap,
  isLoading,
  isError,
  hasMapboxToken,
  tripId,
  t,
  canManageSaved,
}: UseMapMarkersArgs): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (isLoading || isError || !hasMapboxToken) return;

    const pinKey = pinsRenderKey(pinsForMap);
    if (pinKey === lastRenderedPinKeyRef.current) return;
    lastRenderedPinKeyRef.current = pinKey;

    markersRef.current.forEach((m) => {
      (m as unknown as { remove?: () => void }).remove?.();
    });
    markersRef.current = [];

    const pinList = pinsForMap;
    if (!pinList || pinList.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();

    for (const pin of pinList) {
      const elMarker = createMarkerElementForPin(pin);
      const popupHtml = buildPinPopupHtml(pin, tripId, t, canManageSaved);
      const popup = new mapboxgl.Popup({ offset: 25, closeButton: true }).setHTML(popupHtml);

      const marker = new mapboxgl.Marker(elMarker)
        .setLngLat([pin.lng, pin.lat])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);

      bounds.extend([pin.lng, pin.lat]);
    }

    if (!didInitialFitRef.current) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      didInitialFitRef.current = true;
    }
  }, [
    pinsForMap,
    isLoading,
    isError,
    hasMapboxToken,
    tripId,
    t,
    canManageSaved,
    mapReady,
    mapRef,
    markersRef,
    lastRenderedPinKeyRef,
    didInitialFitRef,
  ]);
}
