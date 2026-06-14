'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ==================== Tab Navigation Map ====================

const TAB_SHORTCUTS: Record<string, string> = {
  '1': '/dashboard',
  '2': '/inbox',
  '3': '/leads',
  '4': '/relatorios',
  '5': '/settings',
};

// ==================== Hook ====================

interface UseKeyboardShortcutsOptions {
  /** Callback when Cmd+K is pressed (search focus). */
  onSearchFocus?: () => void;
  /** Callback when Escape is pressed. */
  onEscape?: () => void;
  /** Enable tab switching via Cmd+1..5. Default: true. */
  enableTabSwitch?: boolean;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { onSearchFocus, onEscape, enableTabSwitch = true } = options;
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd+K / Ctrl+K — focus search
      if (isMeta && e.key === 'k') {
        e.preventDefault();
        onSearchFocus?.();
        return;
      }

      // Cmd+1..5 — switch tabs
      if (isMeta && enableTabSwitch && TAB_SHORTCUTS[e.key]) {
        e.preventDefault();
        router.push(TAB_SHORTCUTS[e.key]);
        return;
      }

      // Escape — close panels, clear focus
      if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSearchFocus, onEscape, enableTabSwitch, router]);
}
