import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';

// Reset store before each test
beforeEach(() => {
  const { logout } = useAuthStore.getState();
  logout();
  // Clear localStorage
  if (typeof window !== 'undefined') {
    localStorage.clear();
  }
});

describe('authStore', () => {
  it('starts unauthenticated', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it('setAuth sets user and token', () => {
    const { setAuth } = useAuthStore.getState();
    setAuth(
      { id: 1, operatorId: 1, email: 'test@test.com', name: 'Test', role: 'ADMIN' },
      'test-token-123'
    );

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.name).toBe('Test');
    expect(state.token).toBe('test-token-123');
    expect(state.operatorId).toBe(1);
    expect(state.userRole).toBe('ADMIN');
  });

  it('logout clears auth state', () => {
    const { setAuth, logout } = useAuthStore.getState();
    setAuth(
      { id: 1, operatorId: 1, email: 'test@test.com', name: 'Test', role: 'OPERATOR' },
      'token'
    );
    logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.operatorId).toBeNull();
  });

  it('setHydrated sets hydrated flag', () => {
    const { setHydrated } = useAuthStore.getState();
    setHydrated();
    expect(useAuthStore.getState().hydrated).toBe(true);
  });
});
