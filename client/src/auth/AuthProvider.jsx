import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setUnauthorizedHandler } from '@/api/client.js';
import { authApi } from '@/api/endpoints.js';

const AuthContext = createContext(null);

/**
 * Holds the logged-in user. Asks the server on start (A8); any later 401 from the
 * API (session expired, logged out elsewhere) drops back to anonymous, and
 * RequireAuth then redirects to /login?next=… (WIREFRAMES §1).
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  const signedIn = useCallback((user) => setState({ status: 'authenticated', user }), []);
  const signedOut = useCallback(() => setState({ status: 'anonymous', user: null }), []);

  useEffect(() => {
    const controller = new AbortController();
    authApi
      .me({ signal: controller.signal })
      .then(({ user }) => signedIn(user))
      .catch(() => {
        if (!controller.signal.aborted) signedOut();
      });
    setUnauthorizedHandler(signedOut);
    return () => {
      controller.abort();
      setUnauthorizedHandler(() => {});
    };
  }, [signedIn, signedOut]);

  const login = useCallback(
    async (credentials) => {
      const { user } = await authApi.login(credentials);
      signedIn(user);
      return user;
    },
    [signedIn],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      signedOut();
    }
  }, [signedOut]);

  const value = useMemo(
    () => ({ ...state, signedIn, signedOut, login, logout }),
    [state, signedIn, signedOut, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** @returns {{ status: 'loading'|'authenticated'|'anonymous', user: object|null,
 *   signedIn: Function, signedOut: Function, login: Function, logout: Function }} */
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
