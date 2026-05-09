import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import mapboxgl from 'mapbox-gl';
import type { ComposeFromSavedLocationPayload, MapPin } from '@travel-journal/shared';
import 'mapbox-gl/dist/mapbox-gl.css';

import { fetchMapPins } from '../api/mapPins.js';
import { createSavedLocation, deleteSavedLocation } from '../api/savedLocations.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { GearIcon } from '../components/icons/index.js';
import { useAuth } from '../context/AuthContext.js';
import { usePendingSavedLocationsForTrip } from '../hooks/usePendingSavedLocationsForTrip.js';
import {
  removePendingSavedLocationFromQueue,
  saveOfflineSavedLocation,
} from '../offline/savedLocationSync.js';
import { fetchTrip } from '../api/trips.js';
import { QUERY_STALE_MS } from '../lib/appQueryClient.js';

function mapboxTokenMissingBodyKey(): 'map.mapboxTokenMissingDev' | 'map.mapboxTokenMissingStaging' | 'map.mapboxTokenMissingProd' {
  const mode = import.meta.env.MODE;
  if (mode === 'production') return 'map.mapboxTokenMissingProd';
  if (mode === 'staging') return 'map.mapboxTokenMissingStaging';
  return 'map.mapboxTokenMissingDev';
}

type MapRenderablePin =
  | MapPin
  | {
      kind: 'pendingSavedLocation';
      localId: string;
      lat: number;
      lng: number;
      createdAt: string;
      name?: string;
    };

function getPinSortTime(pin: MapRenderablePin): number {
  return new Date(pin.createdAt).getTime();
}

export function MapScreen() {
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const lastRenderedPinKeyRef = useRef<string>('');
  const didInitialFitRef = useRef(false);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalErrorKey, setSaveModalErrorKey] = useState<string | null>(null);
  const [geoWorking, setGeoWorking] = useState(false);
  const [offlineQueuedFlash, setOfflineQueuedFlash] = useState(false);
  const [mapReady, setMapReady] = useState(false);
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

  const pinsForMap: MapRenderablePin[] = useMemo(() => {
    const serverPins = pins ?? [];
    const pendPins: MapRenderablePin[] = pendingOfflineSaved.map((row) => ({
      kind: 'pendingSavedLocation' as const,
      localId: row.localId,
      lat: row.payload.lat,
      lng: row.payload.lng,
      createdAt: new Date(row.capturedAt).toISOString(),
      ...(row.payload.name !== undefined && row.payload.name.trim() !== ''
        ? { name: row.payload.name.trim() }
        : {}),
    }));

    const list: MapRenderablePin[] = [...serverPins, ...pendPins];
    list.sort((a, b) => getPinSortTime(b) - getPinSortTime(a));
    return list;
  }, [pins, pendingOfflineSaved]);

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

  const mapActionsRef = useRef({
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

  const hasMapboxToken = Boolean(import.meta.env.VITE_MAPBOX_TOKEN?.trim());

  function openSaveModal(): void {
    setSaveModalName('');
    setSaveModalErrorKey(null);
    setSaveModalOpen(true);
  }

  useEffect(() => {
    if (!settingsMenuOpen) return;
    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsMenuRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsMenuOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [settingsMenuOpen]);

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
        // Defensive: unit tests mock Marker without a remove() function.
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (isLoading || isError || !hasMapboxToken) return;

    const pinKey = pinsForMap
      .map((p) =>
        p.kind === 'pendingSavedLocation'
          ? `pending:${p.localId}:${p.createdAt}:${p.lat}:${p.lng}:${p.name ?? ''}`
          : `${p.kind}:${'id' in p ? String(p.id) : ''}:${'entryId' in p ? String(p.entryId) : ''}:${p.createdAt}:${p.lat}:${p.lng}:${'name' in p ? String(p.name ?? '') : ''}`,
      )
      .join('|');
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
      let elMarker: HTMLElement;

      if (pin.kind === 'pendingSavedLocation') {
        elMarker = document.createElement('div');
        elMarker.style.cssText = [
          'width: 26px',
          'height: 26px',
          'background-color: #fcd34d',
          'border: 2px dashed #b45309',
          'border-radius: 50%',
          'cursor: pointer',
          'box-shadow: 0 2px 6px rgba(0,0,0,0.35)',
        ].join(';');
      } else if (pin.kind === 'savedLocation') {
        elMarker = document.createElement('div');
        elMarker.className = 'map-marker-saved';
        elMarker.style.cssText = [
          'width: 26px',
          'height: 26px',
          'background-color: #2563eb',
          'border: 2px solid #fff',
          'border-radius: 50%',
          'cursor: pointer',
          'box-shadow: 0 2px 6px rgba(0,0,0,0.35)',
        ].join(';');
      } else {
        elMarker = document.createElement('div');
        elMarker.className = 'map-marker';
        elMarker.style.cssText = [
          'width: 28px',
          'height: 28px',
          'background-color: #9b3f2b',
          'border: 2px solid #fff',
          'border-radius: 50% 50% 50% 0',
          'transform: rotate(-45deg)',
          'cursor: pointer',
          'box-shadow: 0 2px 6px rgba(0,0,0,0.35)',
        ].join(';');
      }

      const dateFormatted = new Date(pin.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      let popupHtml: string;

      if (pin.kind === 'entry') {
        popupHtml = `<div style="font-family:sans-serif;min-width:180px;padding:4px 0">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${escapeHtml(pin.title)}</div>
          <div style="font-size:12px;color:#666;margin-bottom:8px">${dateFormatted}</div>
          <a
            href="/trips/${tripId}/timeline"
            data-entry-id="${escapeHtml(pin.entryId)}"
            style="font-size:12px;color:#9b3f2b;text-decoration:underline;cursor:pointer"
          >${t('map.viewEntry')}</a>
        </div>`;
      } else if (pin.kind === 'pendingSavedLocation') {
        const label = pin.name?.trim()
          ? escapeHtml(pin.name)
          : `<span style="font-style:italic">${escapeHtml(t('map.savedLocationUntitled'))}</span>`;
        popupHtml = `<div style="font-family:sans-serif;min-width:180px;padding:4px 0">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${label}</div>
          <div style="font-size:11px;color:#92400e;margin-bottom:8px;line-height:1.35">${escapeHtml(t('map.pendingSpotOffline'))}</div>
          <div style="font-size:12px;color:#666;margin-bottom:8px">${dateFormatted}</div>
          ${
            canManageSaved
              ? `<button type="button" data-delete-pending-saved="${escapeHtml(pin.localId)}" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;padding:0">${escapeHtml(t('map.discardPendingSpot'))}</button>`
              : ''
          }
        </div>`;
      } else {
        const label = pin.name?.trim()
          ? escapeHtml(pin.name)
          : `<span style="font-style:italic">${escapeHtml(t('map.savedLocationUntitled'))}</span>`;

        const deleteBtn =
          canManageSaved
            ? `<button type="button" data-delete-saved="${escapeHtml(pin.id)}" style="margin-top:6px;font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;padding:0">${escapeHtml(t('map.deleteSavedLocation'))}</button>`
            : '';

        popupHtml = `<div style="font-family:sans-serif;min-width:180px;padding:4px 0">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${label}</div>
          <div style="font-size:11px;color:#666;margin-bottom:4px">${escapeHtml(t('map.savedBy'))} ${escapeHtml(pin.savedByDisplayName)}</div>
          <div style="font-size:12px;color:#666;margin-bottom:8px">${dateFormatted}</div>
          <button type="button" data-compose-from-saved="${escapeHtml(pin.id)}" data-lat="${String(pin.lat)}" data-lng="${String(pin.lng)}" ${pin.name?.trim() ? `data-pin-name="${escapeHtml(pin.name.trim())}"` : ''}
            style="display:block;margin-bottom:6px;font-size:12px;color:#2563eb;text-decoration:underline;background:none;border:none;padding:0;cursor:pointer;text-align:left"
          >${escapeHtml(t('map.createEntryFromSaved'))}</button>
          ${deleteBtn}
        </div>`;
      }

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
  }, [pinsForMap, isLoading, isError, hasMapboxToken, tripId, t, canManageSaved, mapReady]);

  const showEmptyOverlay = !isLoading && !isError && hasMapboxToken && pinsForMap.length === 0;

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary pt-14 pb-28">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          ref={mapContainerRef}
          className="!absolute inset-0 [&_.mapboxgl-ctrl-bottom-left]:bottom-[4.5rem] [&_.mapboxgl-ctrl-bottom-right]:bottom-[4.5rem]"
        />

        {canManageSaved && hasMapboxToken && !isLoading && !isError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 md:right-14 flex flex-col items-end gap-2">
            {offlineQueuedFlash && (
              <div
                role="status"
                className="font-ui max-w-[14rem] rounded-lg border border-green-700/40 bg-green-950/85 px-3 py-2 text-xs leading-snug text-green-50 shadow-md"
              >
                {t('offline.savedSpotQueued')}
              </div>
            )}
            <div className="relative" ref={settingsMenuRef}>
              <button
                ref={settingsButtonRef}
                type="button"
                onClick={() => setSettingsMenuOpen((prev) => !prev)}
                aria-label={t('map.openMenu')}
                aria-haspopup="menu"
                aria-expanded={settingsMenuOpen}
                className="grid place-items-center rounded-full border border-caption/25 bg-bg-primary/95 p-3 text-body shadow-md hover:bg-bg-secondary backdrop-blur-sm"
              >
                <GearIcon className="h-5 w-5" aria-hidden="true" />
              </button>
              {settingsMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 min-w-[14rem] rounded-lg border border-caption/10 bg-bg-primary shadow-lg py-1 z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="font-ui flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-body hover:bg-bg-secondary"
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      openSaveModal();
                    }}
                  >
                    {t('map.saveCurrentLocation')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {!hasMapboxToken && (
          <div
            role="alert"
            className="absolute top-3 left-3 right-3 z-20 rounded-xl border border-yellow-300 bg-yellow-100 px-4 py-3 font-ui text-sm text-yellow-950 shadow-md dark:border-yellow-700 dark:bg-yellow-950/90 dark:text-yellow-50"
          >
            <p className="font-semibold text-heading">{t('map.mapboxTokenMissingTitle')}</p>
            <p className="mt-1 text-caption leading-snug">{t(mapboxTokenMissingBodyKey())}</p>
          </div>
        )}

        {saveModalOpen && (
          <div
            role="presentation"
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeSaveModal();
            }}
          >
            <div
              role="dialog"
              aria-labelledby="save-location-title"
              className="w-full max-w-sm rounded-xl border border-caption/20 bg-bg-primary p-4 shadow-xl"
              onClick={(ev) => ev.stopPropagation()}
            >
              <h2 id="save-location-title" className="font-ui font-semibold text-heading">
                {t('map.saveLocationTitle')}
              </h2>
              <p className="mt-2 text-sm text-caption font-ui">{t('map.saveLocationHint')}</p>
              {navigator.onLine === false && (
                <p className="mt-2 text-xs text-caption font-ui">{t('map.saveLocationOfflineNote')}</p>
              )}
              <label className="mt-4 block font-ui text-sm text-body" htmlFor="save-location-name">
                {t('map.saveLocationNameLabel')}
              </label>
              <input
                id="save-location-name"
                type="text"
                value={saveModalName}
                disabled={saveMutation.isPending || geoWorking}
                maxLength={500}
                onChange={(ev) => setSaveModalName(ev.target.value)}
                placeholder={t('map.saveLocationNamePlaceholder')}
                className="mt-1 w-full rounded-lg border border-caption/25 bg-bg-secondary px-3 py-2 text-sm font-ui text-body outline-none focus:border-accent/60"
              />
              {saveModalErrorKey !== null ? (
                <p className="mt-3 text-sm text-red-700 dark:text-red-300 font-ui">{t(saveModalErrorKey)}</p>
              ) : null}
              <div className="mt-5 flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={saveMutation.isPending || geoWorking}
                  className="font-ui rounded-lg border border-caption/25 px-3 py-2 text-sm text-body hover:bg-bg-secondary disabled:opacity-50"
                  onClick={() => closeSaveModal()}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={saveMutation.isPending || geoWorking}
                  className="font-ui rounded-lg bg-accent px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                  onClick={() => confirmSaveCurrentLocation()}
                >
                  {saveMutation.isPending || geoWorking ? t('common.loading') : t('map.saveLocationConfirm')}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80">
            <span className="font-ui text-caption text-sm">{t('common.loading')}</span>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg-primary/80 px-6">
            <span className="font-ui text-caption text-sm text-center">{t('common.error')}</span>
            <button
              type="button"
              disabled={isFetching}
              onClick={() => void refetch()}
              className="font-ui text-sm rounded-lg border border-caption/30 bg-bg-secondary px-4 py-2 text-body hover:border-accent/40 disabled:opacity-50"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {showEmptyOverlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-bg-primary/90 rounded-xl px-6 py-4 shadow-md text-center max-w-sm">
              <p className="font-ui text-caption text-sm">{t('map.noPins')}</p>
            </div>
          </div>
        )}
      </div>

      <BottomNavBar {...(tripId !== undefined && { tripId })} {...(tripRole !== undefined && { tripRole })} />
    </div>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
