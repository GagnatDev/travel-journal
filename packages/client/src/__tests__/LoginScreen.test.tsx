import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { AuthProvider } from '../context/AuthContext.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';

// Suppress auto-refresh for all tests in this file — we don't want auto-login
const refresh401 = http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 }));

function renderLoginScreen(initialState?: Record<string, unknown>) {
  const initialEntries = initialState
    ? [{ pathname: '/login', state: initialState }]
    : ['/login'];
  return render(
    <TestMemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/trips" element={<div>Trips page</div>} />
        </Routes>
      </AuthProvider>
    </TestMemoryRouter>,
  );
}

describe('LoginScreen', () => {
  it('renders email, password fields and submit button', () => {
    server.use(refresh401);
    renderLoginScreen();

    expect(screen.getByLabelText(/e-post/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/passord/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logg inn/i })).toBeInTheDocument();
  });

  it('shows validation errors and makes no API call when fields are empty', async () => {
    server.use(refresh401);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    renderLoginScreen();

    await userEvent.click(screen.getByRole('button', { name: /logg inn/i }));

    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    const loginCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('/api/v1/auth/login'),
    );
    expect(loginCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });

  it('shows inline API error on failed login', async () => {
    server.use(
      refresh401,
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ error: { message: 'Invalid credentials' } }, { status: 401 }),
      ),
    );

    renderLoginScreen();

    await userEvent.type(screen.getByLabelText(/e-post/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/passord/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /logg inn/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows session-expired banner when redirected with sessionExpired state', () => {
    server.use(refresh401);
    renderLoginScreen({ sessionExpired: true });

    expect(screen.getByRole('alert')).toHaveTextContent('Økten din har utløpt');
  });

  it('navigates to /trips after successful login', async () => {
    server.use(
      refresh401,
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({
          accessToken: 'tok',
          user: {
            id: '1',
            email: 'a@b.com',
            displayName: 'A',
            appRole: 'creator',
            preferredLocale: 'nb',
          },
        }),
      ),
    );

    renderLoginScreen();

    await userEvent.type(screen.getByLabelText(/e-post/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/passord/i), 'correct');
    await userEvent.click(screen.getByRole('button', { name: /logg inn/i }));

    await waitFor(() => {
      expect(screen.getByText('Trips page')).toBeInTheDocument();
    });
  });
});
