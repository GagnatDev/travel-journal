import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import 'mapbox-gl/dist/mapbox-gl.css';

import { fetchMapPins } from '../api/mapPins.js';
import { createSavedLocation } from '../api/savedLocations.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { useAuth } from '../context/AuthContext.js';
import { usePendingSavedLocationsForTrip } from '../hooks/usePendingSavedLocationsForTrip.js';
import { saveOfflineSavedLocation } from '../offline/savedLocationSync.js';
import { fetchTrip } from '../api/trips.js';
import { QUERY_STALE_MS } from '../lib/appQueryClient.js';
import { MapScreenOverlays } from './map/components/MapScreenOverlays.js';
import { MapSettingsMenu } from './map/components/MapSettingsMenu.js';
import { SaveLocationModal } from './map/components/SaveLocationModal.js';
import {
  type MapScreenMapActions,
  useMapboxMap,
} from './map/hooks/useMapboxMap.js';
import { useMapMarkers } from './map/hooks/useMapMarkers.js';
import { usePinsForMap } from './map/hooks/usePinsForMap.js';
import { useSettingsMenuDismiss } from './map/hooks/useSettingsMenuDismiss.js';

type MapScreenProps = {
  /** When true, the map is kept mounted but not the active tab (timeline ↔ map cache). */
  mapLayerPaused?: boolean;
};

export function MapScreen({ mapLayerPaused = false }: MapScreenProps = {}) {
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalErrorKey, setSaveModalErrorKey] = useState<string | null>(null);
  const [geoWorking, setGeoWorking] = useState(false);
  const [offlineQueuedFlash, setOfflineQueuedFlash] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const pendingOfflineSaved = usePendingSavedLocationsForTrip(tripId);

  const { data: trip } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTrip(tripId!, accessToken!),
    enabled: !!tripId && !!accessToken,
    staleTime: QUERY_STALE_MS.tripDetail,
  });

  const {
    data: pins,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['mapPins', tripId],
    queryFn: () => fetchMapPins(tripId!, accessToken!),
    enabled: !!tripId && !!accessToken,
    staleTime: QUERY_STALE_MS.mapPins,
  });

  const pinsForMap = usePinsForMap(pins, pendingOfflineSaved);

  useEffect(() => {
    if (!offlineQueuedFlash) return;
    const id = window.setTimeout(() => setOfflineQueuedFlash(false), 4000);
    return () => window.clearTimeout(id);
  }, [offlineQueuedFlash]);

  const tripRole = trip?.members.find((m) => m.userId === user?.id)?.tripRole;
  const canManageSaved = tripRole === 'creator' || tripRole === 'contributor';

  const invalidateMapPins = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['mapPins', tripId] });
  }, [queryClient, tripId]);

  const mapActionsRef = useRef<MapScreenMapActions>({
    navigate,
    t,
    tripId: tripId ?? '',
    accessToken: accessToken ?? '',
    invalidateMapPins,
  });
  mapActionsRef.current = {
    navigate,
    t,
    tripId: tripId ?? '',
    accessToken: accessToken ?? '',
    invalidateMapPins,
  };

  const saveMutation = useMutation({
    mutationFn: (body: { lat: number; lng: number; name?: string }) =>
      createSavedLocation(tripId!, body, accessToken!),
    onSuccess: async () => {
      setSaveModalOpen(false);
      setSaveModalName('');
      setSaveModalErrorKey(null);
      await invalidateMapPins();
    },
    onError: () => {
      setSaveModalErrorKey('map.saveLocationFailed');
    },
  });

  const {
    mapContainerRef,
    mapRef,
    markersRef,
    lastRenderedPinKeyRef,
    didInitialFitRef,
    mapReady,
    hasMapboxToken,
  } = useMapboxMap(mapActionsRef);

  useMapMarkers({
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
  });

  useEffect(() => {
    if (mapLayerPaused || !mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const id = requestAnimationFrame(() => {
      if (typeof map.resize === 'function') map.resize();
    });
    return () => cancelAnimationFrame(id);
  }, [mapLayerPaused, mapReady, mapRef]);

  useSettingsMenuDismiss(settingsMenuOpen, settingsMenuRef, settingsButtonRef, setSettingsMenuOpen);

  function openSaveModal(): void {
    setSaveModalName('');
    setSaveModalErrorKey(null);
    setSaveModalOpen(true);
  }

  function closeSaveModal(): void {
    if (saveMutation.isPending || geoWorking) return;
    setSaveModalOpen(false);
    setSaveModalName('');
    setSaveModalErrorKey(null);
  }

  function confirmSaveCurrentLocation(): void {
    setSaveModalErrorKey(null);
    setGeoWorking(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void (async (): Promise<void> => {
          try {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const nameTrimmed = saveModalName.trim();

            const body = {
              lat,
              lng,
              ...(nameTrimmed !== '' && { name: nameTrimmed }),
            };

            if (!navigator.onLine && tripId !== undefined) {
              try {
                await saveOfflineSavedLocation({
                  localId: crypto.randomUUID(),
                  tripId,
                  status: 'pending',
                  payload: body,
                  capturedAt: Date.now(),
                });
                setSaveModalOpen(false);
                setSaveModalName('');
                setSaveModalErrorKey(null);
                setOfflineQueuedFlash(true);
              } catch {
                setSaveModalErrorKey('map.saveLocationFailed');
              }
              return;
            }

            saveMutation.mutate(body);
          } finally {
            setGeoWorking(false);
          }
        })();
      },
      () => {
        setGeoWorking(false);
        setSaveModalErrorKey('map.saveLocationGeolocationDenied');
      },
      { maximumAge: 60_000, timeout: 20_000, enableHighAccuracy: true },
    );
  }

  const showEmptyOverlay = !isLoading && !isError && hasMapboxToken && pinsForMap.length === 0;
  const saveBusy = saveMutation.isPending || geoWorking;

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary pt-14 pb-28">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          ref={mapContainerRef}
          className="!absolute inset-0 [&_.mapboxgl-ctrl-bottom-left]:bottom-[4.5rem] [&_.mapboxgl-ctrl-bottom-right]:bottom-[4.5rem]"
        />

        <MapSettingsMenu
          visible={Boolean(canManageSaved && hasMapboxToken && !isLoading && !isError)}
          menuOpen={settingsMenuOpen}
          onToggleMenu={() => setSettingsMenuOpen((prev) => !prev)}
          menuRef={settingsMenuRef}
          buttonRef={settingsButtonRef}
          offlineQueuedFlash={offlineQueuedFlash}
          onSaveCurrentLocation={() => {
            setSettingsMenuOpen(false);
            openSaveModal();
          }}
        />

        <MapScreenOverlays
          hasMapboxToken={hasMapboxToken}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          showEmptyPins={showEmptyOverlay}
          onRetry={() => void refetch()}
        />

        <SaveLocationModal
          open={saveModalOpen}
          name={saveModalName}
          onNameChange={setSaveModalName}
          errorKey={saveModalErrorKey}
          busy={saveBusy}
          onClose={closeSaveModal}
          onConfirm={confirmSaveCurrentLocation}
        />
      </div>

      <BottomNavBar {...(tripId !== undefined && { tripId })} {...(tripRole !== undefined && { tripRole })} />
    </div>
  );
}
