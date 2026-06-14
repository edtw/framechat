'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  operatorId: number;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR';
  username?: string;
  companyId?: number | string;
  company_id?: number | string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  operatorId: number | null;
  isAuthenticated: boolean;
  userRole: string | null;
  hydrated: boolean;

  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      operatorId: null,
      isAuthenticated: false,
      userRole: null,
      hydrated: false,

      setAuth: (user, token) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('afiliators-token', token);
          localStorage.setItem('afiliators-operatorId', String(user.operatorId));
        }
        set({
          user,
          token,
          operatorId: user.operatorId,
          isAuthenticated: true,
          userRole: user.role,
        });
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('afiliators-token');
          localStorage.removeItem('afiliators-operatorId');
        }
        set({
          user: null,
          token: null,
          operatorId: null,
          isAuthenticated: false,
          userRole: null,
        });
      },

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'afiliators-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);
