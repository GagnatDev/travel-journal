import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Trip } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { TimelineScreen } from '../screens/TimelineScreen.js';
import { TripSettingsScreen } from '../screens/TripSettingsScreen.js';

import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

vi.mock('../notifications/push.js', () => ({
  ensurePushSubscription: vi.fn(async () => 'granted'),
  getPushPermissionState: vi.fn(() => 'granted'),
}));

function makeTrip(status: Trip['status'] = 'active', role: Trip['members'][0]['tripRole'] = 'creator'): Trip {
  return {
    id: 'trip-1',
    name: 'My Trip',
    status,
    createdBy: 'user-1',
    members: [
      {
        userId: 'user-1',
        displayName: 'Test User',
        tripRole: role,
        addedAt: new Date().toISOString(),
        notificationPreferences: { newEntriesMode: 'per_entry' },
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Signed-in user is `mockUser` (`user-1`) as a contributor; another user is trip creator. */
function makeContributorTrip(status: Trip['status'] = 'active'): Trip {
  return {
    id: 'trip-1',
    name: 'Shared Trip',
    status,
    createdBy: 'user-2',
    members: [
      {
        userId: 'user-2',
        displayName: 'Trip Owner',
        tripRole: 'creator',
        addedAt: new Date().toISOString(),
        notificationPreferences: { newEntriesMode: 'per_entry' },
      },
      {
        userId: 'user-1',
        displayName: 'Test User',
        tripRole: 'contributor',
        addedAt: new Date().toISOString(),
        notificationPreferences: { newEntriesMode: 'per_entry' },
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function renderSettings(trip: Trip) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
    http.get('/api/v1/trips/:id', () => HttpResponse.json(trip)),
  );
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={['/trips/trip-1/settings']}>
        <AuthProvider>
          <Routes>
            <Route path="/trips/:id/settings" element={<TripSettingsScreen />} />
            <Route path="/trips/:id/timeline" element={<div>Timeline</div>} />
            <Route path="/trips" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TripSettingsScreen', () => {
  it('for an active trip, shows Mark as Completed; Mark as Active is absent', async () => {
    renderSettings(makeTrip('active'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /merk som fullf|mark as completed/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /merk som aktiv|mark as active/i })).not.toBeInTheDocument();
    });
  });

  it('delete button requires confirmation; cancelling does not call the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderSettings(makeTrip('active'));

    await waitFor(() => screen.getByRole('button', { name: /slett tur|delete trip/i }));

    await userEvent.click(screen.getByRole('button', { name: /slett tur|delete trip/i }));
    expect(screen.getByRole('button', { name: /avbryt|cancel/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /avbryt|cancel/i }));

    const deleteCalls = fetchSpy.mock.calls.filter(
      (c) => String(c[0]).includes('/api/v1/trips') && (c[1] as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });

  it('follower is redirected to timeline', async () => {
    const followerTrip = makeTrip('active', 'follower');
    renderSettings(followerTrip);

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });
  });

  it('contributor stays on settings and sees the settings heading', async () => {
    renderSettings(makeContributorTrip());

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /turinnstillinger|trip settings/i })).toBeInTheDocument();
    });
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('contributor settings load does not request pending trip invites', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderSettings(makeContributorTrip());

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /turinnstillinger|trip settings/i })).toBeInTheDocument();
    });

    const inviteListCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('/api/v1/trips/trip-1/members/invites'),
    );
    expect(inviteListCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });

  it('contributor does not see creator-only trip controls', async () => {
    renderSettings(makeContributorTrip());

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /turinnstillinger|trip settings/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /slett tur|delete trip/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /merk som fullf|mark as completed/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Turnavn$/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /inviter nytt medlem|invite new member/i }),
    ).not.toBeInTheDocument();
  });

  it('contributor trip settings bottom nav reflects contributor role', async () => {
    renderSettings(makeContributorTrip());

    await waitFor(() => {
      const nav = document.querySelector('nav[data-viewer-trip-role]');
      expect(nav).toHaveAttribute('data-viewer-trip-role', 'contributor');
    });
  });

  it('creator save sends description in PATCH body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderSettings(makeTrip('active'));

    await waitFor(() => {
      expect(screen.getByLabelText(/^Beskrivelse|Description$/i)).toBeInTheDocument();
    });

    const desc = screen.getByLabelText(/^Beskrivelse|Description$/i);
    await userEvent.clear(desc);
    await userEvent.type(desc, 'Family reunion in Oslo');
    await userEvent.click(screen.getByRole('button', { name: /lagre|save/i }));

    await waitFor(() => {
      const patchCalls = fetchSpy.mock.calls.filter(
        (c) => String(c[0]).includes('/api/v1/trips/trip-1') && (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const last = patchCalls[patchCalls.length - 1]!;
      const init = last[1] as RequestInit;
      expect(JSON.parse(String(init.body))).toMatchObject({
        name: 'My Trip',
        description: 'Family reunion in Oslo',
      });
    });
    fetchSpy.mockRestore();
  });

  it('shows creator settings after timeline using one QueryClient (trip cache matches useQuery shape)', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      })),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const trip = makeTrip('active');
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
      http.get('/api/v1/trips/:id', () => HttpResponse.json(trip)),
      http.get('/api/v1/trips/trip-1/entries', () =>
        HttpResponse.json({ entries: [], total: 0 }),
      ),
    );

    render(
      <QueryClientProvider client={qc}>
        <TestMemoryRouter initialEntries={['/trips/trip-1/timeline']}>
          <AuthProvider>
            <Routes>
              <Route path="/trips/:id/timeline" element={<TimelineScreen />} />
              <Route path="/trips/:id/settings" element={<TripSettingsScreen />} />
            </Routes>
          </AuthProvider>
        </TestMemoryRouter>
      </QueryClientProvider>,
    );

    // Wait for the timeline to load (story-mode toggle is always rendered)
    await screen.findByTestId('story-mode-toggle');

    await userEvent.click(screen.getByRole('button', { name: /settings|innstillinger/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /merk som fullf|mark as completed/i })).toBeInTheDocument();
    });
  });

});
