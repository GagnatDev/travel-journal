import { useCallback, useEffect, useMemo, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import type { PublicUser } from '@travel-journal/shared';

import { AuthContext, AuthProvider } from '../context/AuthContext.js';
import type { AuthContextValue } from '../context/AuthContext.js';
import { ThemeProvider } from '../context/ThemeContext.js';
import { ProtectedRoute } from '../components/ProtectedRoute.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { server } from './mocks/server.js';
import { mockUser } from './mocks/handlers.js';

const SERVER_PUSHED_DISPLAY_NAME = 'Server Pushed Name';

// Override auto-refresh to return an authenticated user
const refreshHandler = http.post('/api/v1/auth/refresh', () =>
  HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
);

function renderProfile() {
  return render(
    <TestMemoryRouter initialEntries={['/profile']}>
      <AuthProvider>
        <ThemeProvider>
          <Routes>
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfileScreen />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </TestMemoryRouter>,
  );
}

/** Simulates auth resolving user after first paint (user null → populated). */
function ProfileWithDelayedUser() {
  const [user, setUser] = useState<PublicUser | null>(null);
  useEffect(() => {
    setUser(mockUser);
  }, []);
  const setUserFromContext = useCallback((u: PublicUser) => setUser(u), []);
  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken: 'mock-token',
      user,
      status: user ? 'authenticated' : 'loading',
      login: vi.fn(),
      loginWithToken: vi.fn(),
      logout: vi.fn(),
      setUser: setUserFromContext,
    }),
    [user, setUserFromContext],
  );
  return (
    <AuthContext.Provider value={value}>
      <ProfileScreen />
    </AuthContext.Provider>
  );
}

/** Simulates another part of the app calling setUser with an updated display name. */
function ProfileWithUpstreamSetUser() {
  const [user, setUserState] = useState<PublicUser>(mockUser);
  const setUser = useCallback((u: PublicUser) => setUserState(u), []);
  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken: 'mock-token',
      user,
      status: 'authenticated',
      login: vi.fn(),
      loginWithToken: vi.fn(),
      logout: vi.fn(),
      setUser,
    }),
    [user, setUser],
  );
  return (
    <AuthContext.Provider value={value}>
      <button
        type="button"
        onClick={() => setUser({ ...mockUser, displayName: SERVER_PUSHED_DISPLAY_NAME })}
      >
        server-update
      </button>
      <ProfileScreen />
    </AuthContext.Provider>
  );
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    server.use(refreshHandler);
  });

  it("renders the user's current display name", async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText(mockUser.displayName)).toBeInTheDocument();
    });
  });

  it("renders the user's email", async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText(mockUser.email)).toBeInTheDocument();
    });
  });

  it('Edit button reveals input pre-filled with current display name', async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText(mockUser.displayName)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /rediger/i }));

    const input = screen.getByRole('textbox', { name: /kallenavn/i });
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe(mockUser.displayName);
  });

  it('keeps display name draft in sync when user hydrates after first render', async () => {
    render(
      <TestMemoryRouter initialEntries={['/profile']}>
        <ThemeProvider>
          <ProfileWithDelayedUser />
        </ThemeProvider>
      </TestMemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(mockUser.displayName)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /rediger/i }));
    const input = screen.getByRole('textbox', { name: /kallenavn/i });
    expect((input as HTMLInputElement).value).toBe(mockUser.displayName);
  });

  it('keeps display name draft in sync when setUser updates displayName while not editing', async () => {
    render(
      <TestMemoryRouter initialEntries={['/profile']}>
        <ThemeProvider>
          <ProfileWithUpstreamSetUser />
        </ThemeProvider>
      </TestMemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(mockUser.displayName)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /^server-update$/i }));
    await waitFor(() => {
      expect(screen.getByText(SERVER_PUSHED_DISPLAY_NAME)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /rediger/i }));
    const input = screen.getByRole('textbox', { name: /kallenavn/i });
    expect((input as HTMLInputElement).value).toBe(SERVER_PUSHED_DISPLAY_NAME);
  });

  it('Cancel reverts without making an API call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderProfile();

    await waitFor(() => {
      expect(screen.getByText(mockUser.displayName)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /rediger/i }));
    await userEvent.clear(screen.getByRole('textbox', { name: /kallenavn/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /kallenavn/i }), 'Changed Name');
    await userEvent.click(screen.getByRole('button', { name: /avbryt/i }));

    expect(screen.getByText(mockUser.displayName)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    const patchCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('/api/v1/users/me'),
    );
    expect(patchCalls).toHaveLength(0);
  });

  it('Save calls PATCH /api/v1/users/me and updates the displayed name', async () => {
    const newName = 'New Nickname';
    server.use(
      http.patch('/api/v1/users/me', async ({ request }) => {
        const body = (await request.json()) as { displayName: string };
        return HttpResponse.json({ ...mockUser, displayName: body.displayName });
      }),
    );

    renderProfile();

    await waitFor(() => {
      expect(screen.getByText(mockUser.displayName)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /rediger/i }));

    const input = screen.getByRole('textbox', { name: /kallenavn/i });
    await userEvent.clear(input);
    await userEvent.type(input, newName);

    await userEvent.click(screen.getByRole('button', { name: /lagre/i }));

    await waitFor(() => {
      expect(screen.getByText(newName)).toBeInTheDocument();
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Log out button calls logout', async () => {
    const logoutHandler = http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 }));
    server.use(logoutHandler);

    renderProfile();

    await waitFor(() => {
      expect(screen.getByText(mockUser.displayName)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /logg ut/i }));

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });
});
