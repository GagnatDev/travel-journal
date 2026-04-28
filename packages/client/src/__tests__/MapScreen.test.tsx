import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Trip } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { MapScreen } from '../screens/MapScreen.js';
import type { EntryLocationPin } from '../api/entries.js';

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
    remove: vi.fn(),
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

const mockPins: EntryLocationPin[] = [
  {
    entryId: 'entry-1',
    title: 'Paris Stop',
    lat: 48.8566,
    lng: 2.3522,
    name: 'Paris',
    createdAt: new Date().toISOString(),
  },
  {
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
    // Provide a dummy VITE_MAPBOX_TOKEN so the map initialises
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test-token');
    vi.mocked(mapboxgl.Map).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the map view with bottom navigation', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/locations`, () =>
        HttpResponse.json(mockPins),
      ),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /kart|map/i })).toBeInTheDocument();
  });

  it('shows loading state while fetching locations', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/locations`, async () => {
        await new Promise(() => { /* never resolves */ });
        return HttpResponse.json([]);
      }),
    );

    renderMap();

    // Query is only enabled once the auth token resolves, so we must waitFor
    await waitFor(() => {
      expect(screen.getByText('Laster...')).toBeInTheDocument();
    });
  });

  it('shows empty state when no entries have locations', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/locations`, () =>
        HttpResponse.json([]),
      ),
    );

    renderMap();

    await waitFor(() => {
      expect(
        screen.getByText(/Ingen innlegg med plassering ennå/i),
      ).toBeInTheDocument();
    });
  });

  it('does not show empty overlay when entries have locations', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/locations`, () =>
        HttpResponse.json(mockPins),
      ),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.queryByText(/Ingen innlegg med plassering ennå/i)).not.toBeInTheDocument();
    });
  });

  it('shows error state when the query fails', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/locations`, () =>
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
    vi.unstubAllEnvs();
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/locations`, () =>
        HttpResponse.json(mockPins),
      ),
    );

    renderMap();

    await waitFor(() => {
      expect(screen.getByText('Kartet kan ikke vises')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mapboxgl.Map).not.toHaveBeenCalled();
  });

  it('refetches locations when retry is clicked after an error', async () => {
    let requestCount = 0;
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/locations`, () => {
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
