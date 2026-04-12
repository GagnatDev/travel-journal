import { useCallback, useMemo } from 'react';
import type { PublicUser } from '@travel-journal/shared';

import { AuthContext, type AuthContextValue } from '../context/AuthContext.js';

/**
 * Fixed authenticated session without refresh/login network calls.
 * Use in tests when components need `useAuth` immediately.
 */
export function AuthSessionProvider({
  children,
  accessToken,
  user,
}: {
  children: React.ReactNode;
  accessToken: string;
  user: PublicUser;
}) {
  const noop = useCallback(async () => {}, []);
  const loginWithToken = useCallback((_t: string, _u: PublicUser) => {}, []);
  const setUser = useCallback((_u: PublicUser) => {}, []);
  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      user,
      status: 'authenticated',
      login: noop,
      loginWithToken,
      logout: noop,
      setUser,
    }),
    [accessToken, user, noop, loginWithToken, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
