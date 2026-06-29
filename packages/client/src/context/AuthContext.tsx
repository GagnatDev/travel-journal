import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicUser } from '@travel-journal/shared';

import { apiJson, NetworkError } from '../api/client.js';
import { registerRefresh } from '../api/tokenStore.js';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type BootstrapRefreshResponse = { accessToken: string; user: PublicUser };

/**
 * Remembers, across reloads, that the user had a working session and who they
 * were. The access token is intentionally NOT persisted (it stays in memory),
 * but this hint lets us keep an offline user inside the app — able to browse
 * cached data and queue journal entries — when the silent refresh can't reach
 * the server. It is cleared only on a real logout or a genuine session expiry,
 * never on a mere connectivity failure.
 */
const SESSION_HINT_KEY = 'authSessionHint';

function readSessionHint(): PublicUser | null {
  try {
    const raw = localStorage.getItem(SESSION_HINT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

function writeSessionHint(user: PublicUser): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, JSON.stringify(user));
  } catch {
    // localStorage unavailable (private mode / quota) — offline resume just won't persist.
  }
}

function clearSessionHint(): void {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // ignore
  }
}

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
    writeSessionHint(user);
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
      .catch((err) => {
        if (cancelled) return;
        // A connectivity failure must NOT log the user out: if we know they had
        // a session, keep them in the app (without an access token) so they can
        // still read cached content and queue entries while offline. A real
        // auth failure (or no prior session) falls through to unauthenticated.
        const hintedUser = readSessionHint();
        if (err instanceof NetworkError && hintedUser) {
          setState({ accessToken: null, user: hintedUser, status: 'authenticated' });
          return;
        }
        clearSessionHint();
        setState({ accessToken: null, user: null, status: 'unauthenticated' });
      });
    return () => {
      cancelled = true;
    };
  }, [setAuthenticated]);

  // While authenticated offline (no access token yet), try to recover a real
  // token whenever connectivity is likely back. This re-runs the silent refresh
  // so queued entries can sync and authenticated requests resume working.
  useEffect(() => {
    if (state.status !== 'authenticated' || state.accessToken) return;

    let cancelled = false;
    const recover = () => {
      bootstrapRefresh()
        .then((data) => {
          if (!cancelled) setAuthenticated(data.accessToken, data.user);
        })
        .catch(() => {
          // Still unreachable, or a genuine auth failure. If the latter, the
          // next authenticated request will surface `auth:session-expired`.
        });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') recover();
    };
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state.status, state.accessToken, setAuthenticated]);

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
      clearSessionHint();
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
    clearSessionHint();
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
