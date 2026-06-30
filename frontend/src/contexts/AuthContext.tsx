import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSession, saveSession, clearSession } from '../lib/db';
import * as gasApi from '../lib/gasApi';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (loginId: string, password: string) => Promise<void>;
  register: (loginId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateToken: (token: string) => void;
  getValidToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function decodeJwtPayload(token: string): { exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded)) as { exp: number };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        setUser({
          userUUID: session.userUUID,
          loginId: session.loginId,
          token: session.token,
          webhookToken: session.webhookToken,
        });
      }
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const result = await gasApi.login(loginId, password);
    const u: User = {
      userUUID: result.userUUID,
      loginId: result.loginId,
      token: result.token,
      webhookToken: result.webhookToken,
    };
    await saveSession(u);
    setUser(u);
  }, []);

  const register = useCallback(async (loginId: string, password: string) => {
    const result = await gasApi.register(loginId, password);
    const u: User = {
      userUUID: result.userUUID,
      loginId: result.loginId,
      token: result.token,
      webhookToken: result.webhookToken,
    };
    await saveSession(u);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  const updateToken = useCallback(
    (token: string) => {
      setUser((prev) => {
        if (!prev) return null;
        const next = { ...prev, token };
        saveSession(next);
        return next;
      });
    },
    []
  );

  /**
   * 有効なトークンを返す。
   * 残存7日未満 → refresh を試みる。
   * 期限切れ → logout して null を返す。
   */
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    const payload = decodeJwtPayload(user.token);
    if (!payload) return null;

    const now = Math.floor(Date.now() / 1000);
    const remainingDays = (payload.exp - now) / 86400;

    if (remainingDays <= 0) {
      await logout();
      return null;
    }
    if (remainingDays < 7) {
      try {
        const result = await gasApi.refresh(user.token);
        updateToken(result.token);
        return result.token;
      } catch {
        // refresh 失敗でも既存トークンを使い続ける
      }
    }
    return user.token;
  }, [user, logout, updateToken]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateToken, getValidToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth は AuthProvider の内部で使用してください');
  return ctx;
}
