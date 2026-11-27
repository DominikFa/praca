import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { UserProfile } from '../types';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (name: string, login: string, password: string) => Promise<void>;
  updateProfile: (updates: { name?: string; password?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .getMe()
      .then((profile) => setUser(profile))
      .catch(() => {
        localStorage.removeItem('auth_token');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (loginValue: string, password: string) => {
    const res = await api.login({ login: loginValue, password });
    localStorage.setItem('auth_token', res.token);
    setUser(res.user);
  };

  const register = async (name: string, loginValue: string, password: string) => {
    const res = await api.register({ name, login: loginValue, password });
    localStorage.setItem('auth_token', res.token);
    setUser(res.user);
  };

  const updateProfile = async (updates: { name?: string; password?: string }) => {
    const updated = await api.updateMe(updates);
    setUser(updated);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}