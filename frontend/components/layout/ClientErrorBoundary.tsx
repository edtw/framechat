'use client';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export function ClientErrorBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
