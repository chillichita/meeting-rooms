import { createContext, useContext } from 'react';
import type { User } from './api';

export type AuthState = {
  user: User | null;
  /** true while /api/auth/me is resolving on first load */
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
