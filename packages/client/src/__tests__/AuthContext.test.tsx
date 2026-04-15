import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { BrowserRouter } from 'react-router-dom';

import { AuthProvider, useAuth } from '../context/AuthContext.js';
import { routerFutureV7 } from '../reactRouterFuture.js';

import { server } from './mocks/server.js';
import { mockUser } from './mocks/handlers.js';

function AuthStatus() {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="token-in-storage">
        {localStorage.getItem('accessToken') ?? 'not-in-storage'}
      </span>
    </div>
  );
}

function LogoutButton() {
  const { logout, accessToken } = useAuth();
  return (
    <div>
      <span data-testid="has-token">{accessToken ? 'yes' : 'no'}</span>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

function SetUserButton() {
  const { user, setUser } = useAuth();
  return (
    <div>
      <span data-testid="display-name">{user?.displayName ?? 'none'}</span>
      <button onClick={() => setUser({ ...mockUser, displayName: 'New Name' })}>
        Update Name
      </button>
    </div>
  );
}

function renderWithAuth(ui: React.ReactNode) {
  return render(
    <BrowserRouter future={routerFutureV7}>
      <AuthProvider>{ui}</AuthProvider>
    </BrowserRouter>,
  );
}

describe('AuthContext', () => {
  it('becomes authenticated after successful silent refresh', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
    );

    renderWithAuth(<AuthStatus />);

    expect(screen.getByTestId('status').textContent).toBe('loading');

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    expect(screen.getByTestId('user').textContent).toBe(mockUser.email);
  });

  it('access token is in state but not in localStorage', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
    );

    localStorage.removeItem('accessToken');
    renderWithAuth(<AuthStatus />);

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(screen.getByTestId('token-in-storage').textContent).toBe('not-in-storage');
  });

  it('becomes unauthenticated when refresh fails', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
    );

    renderWithAuth(<AuthStatus />);

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
  });

  it('setUser updates the user in context without re-auth', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
    );

    renderWithAuth(<SetUserButton />);

    await waitFor(() => {
      expect(screen.getByTestId('display-name').textContent).toBe(mockUser.displayName);
    });

    await userEvent.click(screen.getByRole('button', { name: /update name/i }));

    expect(screen.getByTestId('display-name').textContent).toBe('New Name');
  });

  it('clears access token from state on logout', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
      http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );

    renderWithAuth(<LogoutButton />);

    await waitFor(() => {
      expect(screen.getByTestId('has-token').textContent).toBe('yes');
    });

    await userEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(screen.getByTestId('has-token').textContent).toBe('no');
  });

  it('becomes unauthenticated when auth:session-expired event is fired', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
    );

    renderWithAuth(<AuthStatus />);

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    window.dispatchEvent(new CustomEvent('auth:session-expired'));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
  });
});
