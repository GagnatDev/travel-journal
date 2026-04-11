import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PublicUser } from '@travel-journal/shared';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  accessToken: string | null;
  user: PublicUser | null;
  status: AuthStatus;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    user: null,
    status: 'loading',
  });

  const setAuthenticated = useCallback((accessToken: string, user: PublicUser) => {
    setState({ accessToken, user, status: 'authenticated' });
    localStorage.setItem('preferredLocale', user.preferredLocale);
  }, []);

  // Attempt silent refresh on mount
  useEffect(() => {
    fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh failed');
        const data = (await res.json()) as { accessToken: string; user: PublicUser };
        setAuthenticated(data.accessToken, data.user);
      })
      .catch(() => {
        setState({ accessToken: null, user: null, status: 'unauthenticated' });
      });
  }, [setAuthenticated]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: { message: string } };
        throw new Error(data.error?.message ?? 'Login failed');
      }

      const data = (await res.json()) as { accessToken: string; user: PublicUser };
      setAuthenticated(data.accessToken, data.user);
    },
    [setAuthenticated],
  );

  const logout = useCallback(async () => {
    if (state.accessToken) {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${state.accessToken}` },
      }).catch(() => {
        // best effort
      });
    }
    setState({ accessToken: null, user: null, status: 'unauthenticated' });
  }, [state.accessToken]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
