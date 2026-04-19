import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicUser } from '@travel-journal/shared';

import { apiJson } from '../api/client.js';
import { registerRefresh } from '../api/tokenStore.js';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type BootstrapRefreshResponse = { accessToken: string; user: PublicUser };

/**
 * Module-level dedupe for the bootstrap refresh call. Under `<React.StrictMode>`
 * the mount effect is invoked twice; without dedupe this issues two concurrent
 * `POST /auth/refresh` requests with the same cookie. The rotation logic on the
 * server is not atomic with the cookie lookup, so the losing request either
 * double-rotates or hits "session not found" and clears the refresh cookie.
 * Either way the second `.catch` overwrites the authenticated state and the
 * user is silently kicked to `/login`, which surfaces as flaky e2e tests on CI.
 */
let bootstrapRefreshInFlight: Promise<BootstrapRefreshResponse> | null = null;

function bootstrapRefresh(): Promise<BootstrapRefreshResponse> {
  if (!bootstrapRefreshInFlight) {
    bootstrapRefreshInFlight = apiJson<BootstrapRefreshResponse>('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    }).finally(() => {
      bootstrapRefreshInFlight = null;
    });
  }
  return bootstrapRefreshInFlight;
}

interface AuthState {
  accessToken: string | null;
  user: PublicUser | null;
  status: AuthStatus;
}

export interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (accessToken: string, user: PublicUser) => void;
  logout: () => Promise<void>;
  setUser: (user: PublicUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    user: null,
    status: 'loading',
  });
  const navigate = useNavigate();

  const setAuthenticated = useCallback((accessToken: string, user: PublicUser) => {
    setState({ accessToken, user, status: 'authenticated' });
    localStorage.setItem('preferredLocale', user.preferredLocale);
  }, []);

  // Attempt silent refresh on mount. The `bootstrapRefresh` dedupe guards
  // against StrictMode double-invocation; the `cancelled` flag guards against
  // late resolutions after a real unmount.
  useEffect(() => {
    let cancelled = false;
    bootstrapRefresh()
      .then((data) => {
        if (cancelled) return;
        setAuthenticated(data.accessToken, data.user);
      })
      .catch(() => {
        if (cancelled) return;
        setState({ accessToken: null, user: null, status: 'unauthenticated' });
      });
    return () => {
      cancelled = true;
    };
  }, [setAuthenticated]);

  // Register the refresh function with the API client when authenticated
  useEffect(() => {
    if (state.status !== 'authenticated') {
      registerRefresh(null);
      return;
    }
    const doRefresh = async (): Promise<string> => {
      const data = await apiJson<{ accessToken: string; user: PublicUser }>(
        '/api/v1/auth/refresh',
        { method: 'POST', credentials: 'include' },
      );
      setAuthenticated(data.accessToken, data.user);
      return data.accessToken;
    };
    registerRefresh(doRefresh);
    return () => registerRefresh(null);
  }, [state.status, setAuthenticated]);

  // Handle session expiry (fired by apiJson when both access token and refresh token are invalid)
  useEffect(() => {
    function handleSessionExpired() {
      setState({ accessToken: null, user: null, status: 'unauthenticated' });
      navigate('/login', { state: { sessionExpired: true }, replace: true });
    }
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, [navigate]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiJson<{ accessToken: string; user: PublicUser }>('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        body: { email, password },
        fallbackErrorMessage: 'Login failed',
      });
      setAuthenticated(data.accessToken, data.user);
    },
    [setAuthenticated],
  );

  const loginWithToken = useCallback(
    (accessToken: string, user: PublicUser) => {
      setAuthenticated(accessToken, user);
    },
    [setAuthenticated],
  );

  const setUser = useCallback((user: PublicUser) => {
    setState((prev) => ({ ...prev, user }));
  }, []);

  const logout = useCallback(async () => {
    if (state.accessToken) {
      await apiJson<void>('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        token: state.accessToken,
      }).catch(() => {
        // best effort
      });
    }
    setState({ accessToken: null, user: null, status: 'unauthenticated' });
  }, [state.accessToken]);

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithToken, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
