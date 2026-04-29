import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProvider } from '../context/AuthContext.js';
import { InviteAcceptScreen } from '../screens/InviteAcceptScreen.js';
import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

function renderScreen(token: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
  );
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[`/invite/accept?token=${token}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/invite/accept" element={<InviteAcceptScreen />} />
            <Route path="/trips" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InviteAcceptScreen', () => {
  it('shows the expired error and no form for an expired/invalid token', async () => {
    server.use(
      http.get('/api/v1/invites/:token/validate', () =>
        HttpResponse.json({ error: { message: 'Gone' } }, { status: 410 }),
      ),
    );

    renderScreen('expired-token');

    await waitFor(() => {
      expect(
        screen.getByRole('alert'),
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('pre-fills the email field as read-only for a valid token', async () => {
    server.use(
      http.get('/api/v1/invites/:token/validate', () =>
        HttpResponse.json({ email: 'invited@example.com', type: 'platform', assignedAppRole: 'creator' }),
      ),
    );

    renderScreen('valid-token');

    await waitFor(() => {
      const emailInput = screen.getByDisplayValue('invited@example.com');
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('readonly');
    });
  });

  it('shows validation error when password is shorter than 8 chars without calling accept', async () => {
    server.use(
      http.get('/api/v1/invites/:token/validate', () =>
        HttpResponse.json({ email: 'invited@example.com', type: 'platform', assignedAppRole: 'creator' }),
      ),
    );

    renderScreen('valid-token');

    await waitFor(() => screen.getByDisplayValue('invited@example.com'));

    await userEvent.type(screen.getByLabelText(/visningsnavn|display name/i), 'My Name');
    await userEvent.type(screen.getByLabelText(/passord|password/i), 'short');
    await userEvent.click(screen.getByRole('button', { name: /opprett konto|create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('navigates to /trips on successful submit', async () => {
    server.use(
      http.get('/api/v1/invites/:token/validate', () =>
        HttpResponse.json({ email: 'invited@example.com', type: 'platform', assignedAppRole: 'creator' }),
      ),
      http.post('/api/v1/invites/accept', () =>
        HttpResponse.json(
          { accessToken: 'new-token', user: { ...mockUser, email: 'invited@example.com' } },
          { status: 201 },
        ),
      ),
    );

    renderScreen('valid-token');

    await waitFor(() => screen.getByDisplayValue('invited@example.com'));

    await userEvent.type(screen.getByLabelText(/visningsnavn|display name/i), 'My Name');
    await userEvent.type(screen.getByLabelText(/passord|password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /opprett konto|create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});
