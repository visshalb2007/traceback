'use client';

import type { AuthTokens, User } from '@traceback/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '@/lib/api';
import { getSession, saveTokens, setSession, subscribeSession } from '@/lib/session';

interface AuthContextValue {
  user: User | null;
  /** False until the stored session has been read, to avoid a flash of "logged out". */
  ready: boolean;
  signIn: (tokens: AuthTokens) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getSession()?.user ?? null);
    setReady(true);
    return subscribeSession(() => setUser(getSession()?.user ?? null));
  }, []);

  const signIn = useCallback((tokens: AuthTokens) => {
    saveTokens(tokens);
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = getSession()?.refreshToken;
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // Signing out locally must succeed even if the server call fails.
    }
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, signIn, signOut }),
    [user, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within <AuthProvider>');
  return context;
}
