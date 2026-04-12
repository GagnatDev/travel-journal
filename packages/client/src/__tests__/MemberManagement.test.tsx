import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Trip } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { TripSettingsScreen } from '../screens/TripSettingsScreen.js';

import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

function makeTrip(extraMembers: Trip['members'] = []): Trip {
  return {
    id: 'trip-1',
    name: 'My Trip',
    status: 'planned',
    createdBy: 'user-1',
    members: [
      { userId: 'user-1', displayName: 'Test User', tripRole: 'creator', addedAt: new Date().toISOString() },
      ...extraMembers,
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
    http.get('/api/v1/trips/:id/members/invites', () => HttpResponse.json([])),
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

describe('MemberManagement (inside TripSettingsScreen)', () => {
  it('adding an existing user by email shows the "Added" confirmation', async () => {
    server.use(
      http.post('/api/v1/trips/:id/members', () => HttpResponse.json({ type: 'added' })),
    );

    renderSettings(makeTrip());

    await waitFor(() => screen.getByPlaceholderText(/e-post eller kallenavn|email or nickname/i));

    await userEvent.type(
      screen.getByPlaceholderText(/e-post eller kallenavn|email or nickname/i),
      'existing@example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: /legg til|add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/medlem lagt til|member added/i)).toBeInTheDocument();
    });
  });

  it('adding an unknown email shows the invite link', async () => {
    server.use(
      http.post('/api/v1/trips/:id/members', () =>
        HttpResponse.json({ type: 'invite_created', inviteLink: '/invite/accept?token=abc' }),
      ),
    );

    renderSettings(makeTrip());

    await waitFor(() => screen.getByPlaceholderText(/e-post eller kallenavn|email or nickname/i));

    await userEvent.type(
      screen.getByPlaceholderText(/e-post eller kallenavn|email or nickname/i),
      'unknown@example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: /legg til|add$/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/\/invite\/accept\?token=abc/)).toBeInTheDocument();
    });
  });

  it('changing the role dropdown calls the role-change endpoint', async () => {
    let roleCalled = false;
    server.use(
      http.patch('/api/v1/trips/:id/members/:userId/role', async () => {
        roleCalled = true;
        return HttpResponse.json({ success: true });
      }),
    );

    const tripWithContrib = makeTrip([
      { userId: 'user-2', displayName: 'Contrib User', tripRole: 'contributor', addedAt: new Date().toISOString() },
    ]);

    renderSettings(tripWithContrib);

    // getByDisplayValue matches the selected option's text content (translated)
    await waitFor(() => screen.getByDisplayValue('Bidragsyter'));

    // Change role from contributor to follower
    await userEvent.selectOptions(screen.getByDisplayValue('Bidragsyter'), 'follower');

    await waitFor(() => {
      expect(roleCalled).toBe(true);
    });
  });

  it('clicking Remove opens a confirmation; confirming calls the remove endpoint', async () => {
    let removeCalled = false;
    server.use(
      http.delete('/api/v1/trips/:id/members/:userId', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const tripWithMember = makeTrip([
      { userId: 'user-2', displayName: 'Other User', tripRole: 'follower', addedAt: new Date().toISOString() },
    ]);

    renderSettings(tripWithMember);

    await waitFor(() => screen.getAllByRole('button', { name: /fjern|remove/i }));

    // Click Remove
    await userEvent.click(screen.getAllByRole('button', { name: /fjern|remove/i })[0]!);

    // Confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bekreft|confirm/i })).toBeInTheDocument();
    });

    // Confirm removal
    await userEvent.click(screen.getByRole('button', { name: /bekreft|confirm/i }));

    await waitFor(() => {
      expect(removeCalled).toBe(true);
    });
  });
});
