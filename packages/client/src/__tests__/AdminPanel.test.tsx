import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Invite, PublicUser } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { AdminPanelScreen } from '../screens/AdminPanelScreen.js';
import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockAdminUser, mockUser } from './mocks/handlers.js';

function renderAdmin(user = mockAdminUser) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user }),
    ),
  );
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<AdminPanelScreen />} />
            <Route path="/trips" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminPanelScreen', () => {
  it('shows access denied and redirects non-admin', async () => {
    renderAdmin(mockUser); // mockUser is 'creator'

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('submitting the invite form shows the generated invite link', async () => {
    const newInvite: Invite = {
      id: 'new-inv',
      type: 'platform',
      email: 'test@invite.com',
      assignedAppRole: 'follower',
      status: 'pending',
      invitedBy: 'admin-1',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    server.use(
      http.post('/api/v1/invites/platform', () =>
        HttpResponse.json(
          { invite: newInvite, inviteLink: '/invite/accept?token=abc123' },
          { status: 201 },
        ),
      ),
      http.get('/api/v1/invites/platform', () => HttpResponse.json([])),
    );

    renderAdmin();

    // Switch to invites tab
    await waitFor(() => screen.getByRole('button', { name: /invitasjoner|invites/i }));
    await userEvent.click(screen.getByRole('button', { name: /invitasjoner|invites/i }));

    // Fill in email and submit
    await waitFor(() => screen.getByLabelText(/e-post|email/i));
    await userEvent.type(screen.getByLabelText(/e-post|email/i), 'test@invite.com');
    await userEvent.click(screen.getByRole('button', { name: /opprett invitasjon|create invite/i }));

    // Should show the invite link field
    await waitFor(() => {
      expect(screen.getByDisplayValue(/\/invite\/accept\?token=abc123/)).toBeInTheDocument();
    });
  });

  it('pending invites are listed and revoking one removes it from the list', async () => {
    const pending: Invite[] = [
      {
        id: 'inv-1',
        type: 'platform',
        email: 'pending@example.com',
        assignedAppRole: 'follower',
        status: 'pending',
        invitedBy: 'admin-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    server.use(
      http.get('/api/v1/invites/platform', () => HttpResponse.json(pending)),
      http.delete('/api/v1/invites/platform/:id', () => new HttpResponse(null, { status: 204 })),
    );

    renderAdmin();

    await waitFor(() => screen.getByRole('button', { name: /invitasjoner|invites/i }));
    await userEvent.click(screen.getByRole('button', { name: /invitasjoner|invites/i }));

    await waitFor(() => {
      expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    });

    // After revoke, list should be refreshed (mock returns empty)
    server.use(http.get('/api/v1/invites/platform', () => HttpResponse.json([])));

    await userEvent.click(screen.getByRole('button', { name: /trekk tilbake|revoke/i }));

    await waitFor(() => {
      expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument();
    });
  });

  it('invite submit button renders as a pill-shaped button (rounded-full)', async () => {
    server.use(
      http.get('/api/v1/invites/platform', () => HttpResponse.json([])),
    );

    renderAdmin();

    await waitFor(() => screen.getByRole('button', { name: /invitasjoner|invites/i }));
    await userEvent.click(screen.getByRole('button', { name: /invitasjoner|invites/i }));

    await waitFor(() => screen.getByRole('button', { name: /opprett invitasjon|create invite/i }));
    expect(screen.getByRole('button', { name: /opprett invitasjon|create invite/i })).toHaveClass('rounded-full');
  });

  it('pending invites use dashed card layout', async () => {
    const pending: Invite[] = [
      {
        id: 'inv-2',
        type: 'platform',
        email: 'dashed@example.com',
        assignedAppRole: 'follower',
        status: 'pending',
        invitedBy: 'admin-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    server.use(http.get('/api/v1/invites/platform', () => HttpResponse.json(pending)));

    const { container } = renderAdmin();

    await waitFor(() => screen.getByRole('button', { name: /invitasjoner|invites/i }));
    await userEvent.click(screen.getByRole('button', { name: /invitasjoner|invites/i }));

    await waitFor(() => screen.getByText('dashed@example.com'));

    const dashedCards = container.querySelectorAll('.border-dashed');
    expect(dashedCards.length).toBeGreaterThan(0);
  });

  it('Promote button on a follower calls promote endpoint and updates displayed role', async () => {
    const follower: PublicUser = {
      id: 'follower-1',
      email: 'follower@example.com',
      displayName: 'Follower User',
      appRole: 'follower',
      preferredLocale: 'nb',
    };

    server.use(
      http.get('/api/v1/users', () => HttpResponse.json([follower])),
      http.patch('/api/v1/users/:id/promote', () =>
        HttpResponse.json({ ...follower, appRole: 'creator' }),
      ),
    );

    renderAdmin();

    await waitFor(() => {
      expect(screen.getByText('Follower User')).toBeInTheDocument();
    });

    // Should show the Promote button for followers
    expect(screen.getByRole('button', { name: /forfrem|promote/i })).toBeInTheDocument();

    // After promote, role should update (mock returns empty then refreshed list)
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json([{ ...follower, appRole: 'creator' }]),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /forfrem|promote/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /forfrem|promote/i })).not.toBeInTheDocument();
    });
  });
});
