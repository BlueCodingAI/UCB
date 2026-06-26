'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setAccessToken, getAccessToken, type Realm } from '@/lib/api';
import type { Session, User } from '@/lib/types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  setSession: (s: Session, realm?: Realm) => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children, realm = 'user' }: { children: React.ReactNode; realm?: Realm }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const meEndpoint = realm === 'admin' ? '/admin/auth/me' : '/auth/me';

  const refreshUser = useCallback(async () => {
    if (!getAccessToken(realm)) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get<{ user: User }>(meEndpoint, { realm });
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [realm, meEndpoint]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const setSession = useCallback(
    (s: Session, r: Realm = realm) => {
      setAccessToken(r, s.accessToken);
      setUser(s.user);
      setLoading(false);
    },
    [realm],
  );

  const logout = useCallback(async () => {
    try {
      await api.post(realm === 'admin' ? '/admin/auth/logout' : '/auth/logout', {}, { realm });
    } catch {
      /* ignore */
    }
    setAccessToken(realm, null);
    setUser(null);
  }, [realm]);

  return <Ctx.Provider value={{ user, loading, setSession, refreshUser, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
