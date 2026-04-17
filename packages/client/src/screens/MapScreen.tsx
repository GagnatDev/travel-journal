import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { fetchEntryLocations } from '../api/entries.js';
import { useAuth } from '../context/AuthContext.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { fetchTrip } from '../api/trips.js';
import { QUERY_STALE_MS } from '../lib/appQueryClient.js';

export function MapScreen() {
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

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
  } = useQuery({
    queryKey: ['entryLocations', tripId],
    queryFn: () => fetchEntryLocations(tripId!, accessToken!),
    enabled: !!tripId && !!accessToken,
    staleTime: QUERY_STALE_MS.entryLocations,
  });

  useEffect(() => {
    if (!mapContainerRef.current || isLoading || isError) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) return;

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
      if (!pins || pins.length === 0) return;

      const bounds = new mapboxgl.LngLatBounds();

      for (const pin of pins) {
        const el = document.createElement('div');
        el.className = 'map-marker';
        el.style.cssText = [
          'width: 28px',
          'height: 28px',
          'background-color: #9b3f2b',
          'border: 2px solid #fff',
          'border-radius: 50% 50% 50% 0',
          'transform: rotate(-45deg)',
          'cursor: pointer',
          'box-shadow: 0 2px 6px rgba(0,0,0,0.35)',
        ].join(';');

        const dateFormatted = new Date(pin.createdAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });

        const popup = new mapboxgl.Popup({ offset: 25, closeButton: true }).setHTML(
          `<div style="font-family:sans-serif;min-width:160px;padding:4px 0">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">${escapeHtml(pin.title)}</div>
            <div style="font-size:12px;color:#666;margin-bottom:8px">${dateFormatted}</div>
            <a
              href="/trips/${tripId}/timeline"
              data-entry-id="${pin.entryId}"
              style="font-size:12px;color:#9b3f2b;text-decoration:underline;cursor:pointer"
            >${t('map.viewEntry')}</a>
          </div>`,
        );

        new mapboxgl.Marker(el).setLngLat([pin.lng, pin.lat]).setPopup(popup).addTo(map);

        bounds.extend([pin.lng, pin.lat]);
      }

      if (pins.length > 0) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }
    });

    // Handle "View Entry" clicks inside popups via delegation
    function handlePopupClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[data-entry-id]') as HTMLAnchorElement | null;
      if (!anchor) return;
      e.preventDefault();
      const entryId = anchor.dataset['entryId'];
      navigate(`/trips/${tripId}/timeline`, { state: { highlightEntryId: entryId } });
    }
    document.addEventListener('click', handlePopupClick);

    return () => {
      document.removeEventListener('click', handlePopupClick);
      map.remove();
      mapRef.current = null;
    };
  }, [pins, isLoading, isError, tripId, navigate, t]);

  const tripRole = trip?.members.find((m) => m.userId === user?.id)?.tripRole;

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary pt-14 pb-28">
      {/* Map area — title lives in AppHeader; reserve space for fixed bottom nav */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          ref={mapContainerRef}
          className="!absolute inset-0 [&_.mapboxgl-ctrl-bottom-left]:bottom-[4.5rem] [&_.mapboxgl-ctrl-bottom-right]:bottom-[4.5rem]"
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80">
            <span className="font-ui text-caption text-sm">{t('common.loading')}</span>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80">
            <span className="font-ui text-caption text-sm">{t('common.error')}</span>
          </div>
        )}

        {!isLoading && !isError && pins !== undefined && pins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-bg-primary/90 rounded-xl px-6 py-4 shadow-md text-center">
              <p className="font-ui text-caption text-sm">{t('map.noLocations')}</p>
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
