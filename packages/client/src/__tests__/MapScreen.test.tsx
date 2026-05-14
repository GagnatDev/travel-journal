import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { MapPin, Trip } from '@travel-journal/shared';

import i18n from '../i18n.js';
import { AuthProvider } from '../context/AuthContext.js';
import { MapScreen } from '../screens/MapScreen.js';
import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

// Mock mapbox-gl — the real SDK requires a browser WebGL context and live network
// requests that are not available in jsdom.
vi.mock('mapbox-gl', () => {
  const Popup = vi.fn().mockImplementation(() => ({
    setHTML: vi.fn().mockReturnThis(),
  }));

  const Marker = vi.fn().mockImplementation(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
  }));

  const LngLatBounds = vi.fn().mockImplementation(() => ({
    extend: vi.fn(),
  }));

  const NavigationControl = vi.fn();

  const Map = vi.fn().mockImplementation(() => ({
    addControl: vi.fn(),
    on: vi.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') cb();
    }),
    fitBounds: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
    stop: vi.fn(),
    easeTo: vi.fn(),
    flyTo: vi.fn(),
  }));

  return {
    default: {
      Map,
      Marker,
      Popup,
      LngLatBounds,
      NavigationControl,
      accessToken: '',
    },
    Map,
    Marker,
    Popup,
    LngLatBounds,
    NavigationControl,
  };
});

// Also mock the CSS import that mapbox-gl/dist/mapbox-gl.css triggers in jsdom
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

const TRIP_ID = 'trip-1';

const mockTrip: Trip = {
  id: TRIP_ID,
  name: 'Map Trip',
  status: 'active',
  createdBy: 'user-1',
  allowContributorInvites: false,
  members: [
    {
      userId: 'user-1',
      displayName: 'Test User',
      tripRole: 'creator',
      addedAt: new Date().toISOString(),
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockPins: MapPin[] = [
  {
    kind: 'entry',
    entryId: 'entry-1',
    title: 'Paris Stop',
    lat: 48.8566,
    lng: 2.3522,
    name: 'Paris',
    createdAt: new Date().toISOString(),
  },
  {
    kind: 'entry',
    entryId: 'entry-2',
    title: 'Rome Stop',
    lat: 41.9028,
    lng: 12.4964,
    createdAt: new Date().toISOString(),
  },
];

function renderMap(user = mockUser) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user }),
    ),
    http.get('/api/v1/trips/:id', () => HttpResponse.json(mockTrip)),
  );
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[`/trips/${TRIP_ID}/map`]}>
        <AuthProvider>
          <Routes>
            <Route path="/trips/:id/map" element={<MapScreen />} />
            <Route path="/trips/:id/timeline" element={<div>Timeline</div>} />
          </Routes>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MapScreen', () => {
  beforeEach(() => {
    void i18n.changeLanguage('nb');
    // Provide a dummy VITE_MAPBOX_TOKEN so the map initialises
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test-token');
    vi.mocked(mapboxgl.Map).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the map view with bottom navigation', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => HttpResponse.json(mockPins)),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /kart|map/i })).toBeInTheDocument();
  });

  it('shows loading state while fetching map pins', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, async () => {
        await new Promise(() => {
          /* never resolves */
        });
        return HttpResponse.json([]);
      }),
    );

    renderMap();

    // Query is only enabled once the auth token resolves, so we must waitFor
    await waitFor(() => {
      expect(screen.getByText('Laster...')).toBeInTheDocument();
    });
  });

  it('shows empty state when there are no map pins', async () => {
    server.use(http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => HttpResponse.json([])));

    renderMap();

    await waitFor(() => {
      expect(screen.getByText(/Ingen kartmerker ennå/i)).toBeInTheDocument();
    });
  });

  it('shows save-location control when user can contribute', async () => {
    server.use(http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => HttpResponse.json([])));

    renderMap();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Åpne kartmeny/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Åpne kartmeny/i }));
    expect(screen.getByRole('menuitem', { name: /Lagre nåværende sted/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Gå til min posisjon/i })).toBeInTheDocument();
  });

  it('eases the map to current location when go to my location is chosen', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      queueMicrotask(() =>
        success({
          coords: {
            latitude: 60.12,
            longitude: 10.25,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition),
      );
    });
    const origGeo = globalThis.navigator.geolocation;
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition,
        watchPosition: vi.fn(() => 1),
        clearWatch: vi.fn(),
      },
    });

    server.use(http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => HttpResponse.json(mockPins)));

    renderMap();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Åpne kartmeny/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Åpne kartmeny/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Gå til min posisjon/i }));

    await waitFor(() => {
      expect(getCurrentPosition).toHaveBeenCalled();
    });

    const mapInstance = vi.mocked(mapboxgl.Map).mock.results[0]?.value as {
      easeTo: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    };
    await waitFor(() => {
      expect(mapInstance.easeTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [10.25, 60.12],
          duration: 900,
        }),
      );
    });
    expect(mapInstance.stop).toHaveBeenCalled();

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: origGeo,
    });
  });

  it('does not show empty overlay when entries have pins', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => HttpResponse.json(mockPins)),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.queryByText(/Ingen kartmerker ennå/i)).not.toBeInTheDocument();
    });
  });

  it('subscribes to geolocation on an active trip when the map is ready', async () => {
    const watchPosition = vi.fn((success: PositionCallback) => {
      queueMicrotask(() =>
        success({
          coords: {
            latitude: 59.9139,
            longitude: 10.7522,
            accuracy: 12,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition),
      );
      return 7;
    });
    const clearWatch = vi.fn();
    const origGeo = globalThis.navigator.geolocation;
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition,
        clearWatch,
        getCurrentPosition: vi.fn(),
      },
    });

    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => HttpResponse.json(mockPins)),
    );

    renderMap();

    await waitFor(() => {
      expect(watchPosition).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(vi.mocked(mapboxgl.Marker).mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: origGeo,
    });
  });

  it('does not subscribe to geolocation when the trip is not active', async () => {
    const watchPosition = vi.fn(() => 1);
    const origGeo = globalThis.navigator.geolocation;
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition,
        clearWatch: vi.fn(),
        getCurrentPosition: vi.fn(),
      },
    });

    server.use(
      http.get('/api/v1/trips/:id', () =>
        HttpResponse.json({ ...mockTrip, status: 'planned' satisfies Trip['status'] }),
      ),
      http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => HttpResponse.json(mockPins)),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.queryByText(/Ingen kartmerker ennå/i)).not.toBeInTheDocument();
    });

    expect(watchPosition).not.toHaveBeenCalled();

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: origGeo,
    });
  });

  it('shows error state when the query fails', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () =>
        HttpResponse.json({ error: { message: 'Server error' } }, { status: 500 }),
      ),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.getByText('Det oppstod en feil')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /prøv igjen/i })).toBeInTheDocument();
  });

  it('shows token-missing banner and does not initialise Mapbox when token is unset', async () => {
    // Stub empty explicitly: vi.unstubAllEnvs() restores the worker's real env, so a
    // host/CI VITE_MAPBOX_TOKEN would make this test fail intermittently.
    vi.stubEnv('VITE_MAPBOX_TOKEN', '');
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => HttpResponse.json(mockPins)),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.getByText('Kartet kan ikke vises')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mapboxgl.Map).not.toHaveBeenCalled();
  });

  it('refetches pins when retry is clicked after an error', async () => {
    let requestCount = 0;
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/map-pins`, () => {
        requestCount += 1;
        if (requestCount === 1) {
          return HttpResponse.json({ error: { message: 'Server error' } }, { status: 500 });
        }
        return HttpResponse.json(mockPins);
      }),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.getByText('Det oppstod en feil')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /prøv igjen/i }));

    await waitFor(() => {
      expect(screen.queryByText('Det oppstod en feil')).not.toBeInTheDocument();
    });
    expect(requestCount).toBe(2);
  });
});
