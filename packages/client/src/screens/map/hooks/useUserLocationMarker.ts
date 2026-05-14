import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import mapboxgl from 'mapbox-gl';
import type { TripStatus } from '@travel-journal/shared';

import { createUserLocationMarkerElement } from '../createUserLocationMarkerElement.js';

type UseUserLocationMarkerArgs = {
  mapRef: MutableRefObject<mapboxgl.Map | null>;
  mapReady: boolean;
  hasMapboxToken: boolean;
  isLoading: boolean;
  isError: boolean;
  tripStatus: TripStatus | undefined;
  mapLayerPaused: boolean;
  pinCount: number;
};

/**
 * Shows live GPS position on the map during active trips (distinct from saved-location pins).
 */
export function useUserLocationMarker({
  mapRef,
  mapReady,
  hasMapboxToken,
  isLoading,
  isError,
  tripStatus,
  mapLayerPaused,
  pinCount,
}: UseUserLocationMarkerArgs): void {
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const didFlyToUserRef = useRef(false);
  const pinCountRef = useRef(pinCount);
  pinCountRef.current = pinCount;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !hasMapboxToken || isLoading || isError) return;
    const mapInstance = map;

    const geo = navigator.geolocation;
    const shouldTrack =
      tripStatus === 'active' &&
      !mapLayerPaused &&
      typeof geo?.watchPosition === 'function';

    if (!shouldTrack) {
      const m = markerRef.current as unknown as { remove?: () => void } | null;
      m?.remove?.();
      markerRef.current = null;
      return;
    }

    function clearMarker(): void {
      const m = markerRef.current as unknown as { remove?: () => void } | null;
      m?.remove?.();
      markerRef.current = null;
    }

    function onPosition(lng: number, lat: number): void {
      if (!markerRef.current) {
        const el = createUserLocationMarkerElement();
        markerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(mapInstance);
        if (pinCountRef.current === 0 && !didFlyToUserRef.current) {
          didFlyToUserRef.current = true;
          mapInstance.stop();
          mapInstance.flyTo({ center: [lng, lat], zoom: 12, duration: 1000 });
        }
      } else {
        markerRef.current.setLngLat([lng, lat]);
      }
    }

    const watchId = geo.watchPosition(
      (pos) => {
        onPosition(pos.coords.longitude, pos.coords.latitude);
      },
      () => {
        clearMarker();
      },
      { maximumAge: 30_000, timeout: 20_000, enableHighAccuracy: false },
    );

    return () => {
      geo.clearWatch(watchId);
      clearMarker();
    };
  }, [mapRef, mapReady, hasMapboxToken, isLoading, isError, tripStatus, mapLayerPaused]);
}
