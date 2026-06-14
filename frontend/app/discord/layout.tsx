'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

/**
 * Discord section is rendered as full-screen Discord-style chrome (its own
 * guild rail / sidebar), so it does NOT use the CRM DashboardLayout shell.
 * We still reuse the exact same auth guard pattern: wait for zustand
 * hydration, then redirect unauthenticated users to /login.
 */
export default function DiscordLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, hydrated } = useAuthStore();

  useEffect(() => {
    if (hydrated && !isAuthenticated && typeof window !== 'undefined') {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated) return null;
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
