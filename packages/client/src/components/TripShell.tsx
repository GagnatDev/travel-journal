import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet, useMatch, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const MapScreen = lazy(() =>
  import('../screens/MapScreen.js').then((m) => ({ default: m.MapScreen })),
);

/**
 * Wraps all `/trips/:id/*` screens. After the user opens the map once for a trip,
 * keeps {@link MapScreen} mounted (hidden on non-map routes) until they open another
 * trip (`:id` changes), so Mapbox does not reload when moving around that trip.
 */
export function TripShell() {
  const { id: tripId } = useParams();
  const { t } = useTranslation();
  const matchMap = useMatch({ path: '/trips/:id/map', end: true });

  const [mapSessionWarm, setMapSessionWarm] = useState(false);

  useEffect(() => {
    setMapSessionWarm(false);
  }, [tripId]);

  useEffect(() => {
    if (matchMap) setMapSessionWarm(true);
  }, [matchMap]);

  const parkMapLayer = mapSessionWarm;
  const mapTabActive = Boolean(matchMap);

  return (
    <>
      {parkMapLayer && (
        <div
          className={
            mapTabActive
              ? 'relative z-0 min-h-screen'
              : 'pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-0 [visibility:hidden]'
          }
          aria-hidden={!mapTabActive}
        >
          <Suspense
            fallback={
              mapTabActive ? (
                <div className="flex items-center justify-center min-h-screen bg-bg-primary">
                  <p className="font-ui text-body">{t('common.loading')}</p>
                </div>
              ) : (
                <div className="absolute inset-0" aria-hidden />
              )
            }
          >
            <MapScreen key={tripId} mapLayerPaused={!mapTabActive} />
          </Suspense>
        </div>
      )}

      <div className={mapTabActive ? 'hidden' : 'relative z-10 min-h-0'}>
        <Outlet />
      </div>
    </>
  );
}
