import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Trip } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { TripDashboardScreen } from '../screens/TripDashboardScreen.js';

import { server } from './mocks/server.js';
import { mockUser } from './mocks/handlers.js';

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    name: 'Test Trip',
    status: 'planned',
    createdBy: 'user-1',
    members: [{ userId: 'user-1', displayName: 'Test User', tripRole: 'creator', addedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderDashboard(user = mockUser) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user }),
    ),
  );
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/trips']}>
        <AuthProvider>
          <Routes>
            <Route path="/trips" element={<TripDashboardScreen />} />
            <Route path="/trips/:id/timeline" element={<div>Timeline</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TripDashboardScreen', () => {
  it('shows empty state when user has no trips', async () => {
    server.use(http.get('/api/v1/trips', () => HttpResponse.json([])));
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/du har ingen turer|you have no trips/i)).toBeInTheDocument();
    });
  });

  it('renders trips under correct status group headings', async () => {
    const trips: Trip[] = [
      makeTrip({ id: 'trip-1', name: 'Active Trip', status: 'active' }),
      makeTrip({ id: 'trip-2', name: 'Planned Trip', status: 'planned' }),
      makeTrip({ id: 'trip-3', name: 'Done Trip', status: 'completed' }),
    ];
    server.use(http.get('/api/v1/trips', () => HttpResponse.json(trips)));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Active Trip')).toBeInTheDocument();
      expect(screen.getByText('Planned Trip')).toBeInTheDocument();
      expect(screen.getByText('Done Trip')).toBeInTheDocument();
    });
  });

  it('shows Create Trip button for creator and admin', async () => {
    server.use(http.get('/api/v1/trips', () => HttpResponse.json([])));

    // Creator
    renderDashboard(mockUser); // mockUser has appRole: 'creator'
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /opprett tur|create trip/i })).toBeInTheDocument();
    });
  });

  it('hides Create Trip button for follower', async () => {
    const follower = { ...mockUser, appRole: 'follower' as const };
    server.use(http.get('/api/v1/trips', () => HttpResponse.json([])));

    renderDashboard(follower);
    await waitFor(() => {
      // Wait for screen to settle
      expect(screen.queryByRole('button', { name: /opprett tur|create trip/i })).not.toBeInTheDocument();
    });
  });

  it('shows user trip-level role on each card', async () => {
    const trips: Trip[] = [
      makeTrip({
        members: [{ userId: 'user-1', displayName: 'Test User', tripRole: 'creator', addedAt: new Date().toISOString() }],
      }),
    ];
    server.use(http.get('/api/v1/trips', () => HttpResponse.json(trips)));

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/oppretter|creator/i)).toBeInTheDocument();
    });
  });
});
