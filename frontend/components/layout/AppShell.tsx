'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { IconSidebar } from './IconSidebar';

// ==================== Page Title Map ====================

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/inbox': 'Caixa de Entrada',
  '/leads': 'Leads',
  '/negocios': 'Negócios',
  '/tarefas': 'Tarefas',
  '/contatos': 'Contatos',
  '/conhecimento': 'Conhecimento',
  '/relatorios': 'Relatórios',
  '/pix': 'Cobranças PIX',
  '/virtual-cards': 'Cartões Virtuais',
  '/settings': 'Configurações',
  '/lgpd': 'Privacidade & LGPD',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, hydrated } = useAuthStore();

  // Determine current page title
  const pageTitle =
    Object.entries(pageTitles).find(([key]) => pathname?.startsWith(key))?.[1] || '';

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onEscape: () => {
      // Close any open modals/panels via global event
      window.dispatchEvent(new CustomEvent('app:escape'));
    },
  });

  // Auth guard
  useEffect(() => {
    if (hydrated && !isAuthenticated && typeof window !== 'undefined') {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated) return null;
  if (!isAuthenticated) return null;

  return (
    <div className="h-screen flex bg-[#0A0A0F] overflow-hidden">
      <IconSidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Desktop page header */}
        {pageTitle && (
          <div className="hidden md:flex items-center h-11 px-6 border-b border-white/[0.04] shrink-0">
            <h1 className="text-sm font-semibold text-white/60">{pageTitle}</h1>
          </div>
        )}
        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
