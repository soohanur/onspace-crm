'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { auth, type AuthContext as AuthCtxValue, hasPermission } from '@/lib/auth';

interface ContextShape {
  ctx: AuthCtxValue | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (perm: string) => boolean;
}

const AuthContext = createContext<ContextShape | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<AuthCtxValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await auth.me();
      setCtx(data);
      setError(null);
    } catch {
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const data = await auth.login(email, password);
        setCtx(data);
      } catch (e: any) {
        setError(e?.message ?? 'Login failed');
        throw e;
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await auth.logout().catch(() => {});
    setCtx(null);
  }, []);

  const can = useCallback((perm: string) => hasPermission(ctx, perm), [ctx]);

  return (
    <AuthContext.Provider value={{ ctx, loading, error, refresh, signIn, signOut, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
