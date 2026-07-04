import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import mapboxgl from 'mapbox-gl';

import { buildClusterPopupHtml, buildPinPopupHtml } from '../pinPopupHtml.js';
import { clusterRenderablePins, clustersRenderKey } from '../clusterPins.js';
import {
  createClusterMarkerElement,
  createMarkerElementForPin,
} from '../createMarkerElementForPin.js';
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

    function renderMarkers(): void {
      if (!map) return;
      const clusters = clusterRenderablePins(pinsForMap, (lngLat) => map.project(lngLat));

      const renderKey = clustersRenderKey(clusters);
      if (renderKey === lastRenderedPinKeyRef.current) return;
      lastRenderedPinKeyRef.current = renderKey;

      markersRef.current.forEach((m) => {
        (m as unknown as { remove?: () => void }).remove?.();
      });
      markersRef.current = [];

      for (const cluster of clusters) {
        const soloPin = cluster.pins.length === 1 ? cluster.pins[0] : undefined;
        const elMarker = soloPin
          ? createMarkerElementForPin(soloPin)
          : createClusterMarkerElement(
              cluster.pins.length,
              t('map.clusterPinCount', { total: cluster.pins.length }),
            );
        const popupHtml = soloPin
          ? buildPinPopupHtml(soloPin, tripId, t, canManageSaved)
          : buildClusterPopupHtml(cluster.pins, tripId, t, canManageSaved);
        const popup = new mapboxgl.Popup({
          offset: 25,
          closeButton: true,
          className: 'tj-map-popup',
          maxWidth: '280px',
        }).setHTML(popupHtml);

        const marker = new mapboxgl.Marker(elMarker)
          .setLngLat([cluster.lng, cluster.lat])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    renderMarkers();

    if (!didInitialFitRef.current && pinsForMap.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      for (const pin of pinsForMap) {
        bounds.extend([pin.lng, pin.lat]);
      }
      map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      didInitialFitRef.current = true;
    }

    // Screen distance between pins changes with zoom, so regroup after zooming.
    const handleZoomEnd = (): void => renderMarkers();
    map.on('zoomend', handleZoomEnd);
    return () => {
      map.off('zoomend', handleZoomEnd);
    };
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
