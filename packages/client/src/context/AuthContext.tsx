import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicUser } from '@travel-journal/shared';

import { apiJson } from '../api/client.js';
import { registerRefresh } from '../api/tokenStore.js';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

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

  // Attempt silent refresh on mount
  useEffect(() => {
    apiJson<{ accessToken: string; user: PublicUser }>('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then((data) => setAuthenticated(data.accessToken, data.user))
      .catch(() => {
        setState({ accessToken: null, user: null, status: 'unauthenticated' });
      });
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
