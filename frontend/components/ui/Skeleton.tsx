'use client';

import { cn } from '@/lib/utils';

// ==================== Primitives ====================

interface SkeletonBaseProps {
  className?: string;
}

export function SkeletonLine({ className }: SkeletonBaseProps) {
  return (
    <div
      className={cn(
        'h-3.5 rounded-md bg-white/[0.04] animate-pulse',
        className
      )}
    />
  );
}

export function SkeletonCircle({ className }: SkeletonBaseProps) {
  return (
    <div
      className={cn(
        'rounded-full bg-white/[0.04] animate-pulse',
        className
      )}
    />
  );
}

export function SkeletonBlock({ className }: SkeletonBaseProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-white/[0.04] animate-pulse',
        className
      )}
    />
  );
}

// ==================== Composite Skeletons ====================

export function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <SkeletonCircle className="w-10 h-10 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <SkeletonLine className="w-24" />
        <SkeletonLine className="w-40" />
      </div>
    </div>
  );
}

export function MessageSkeletonRow({ right }: { right?: boolean }) {
  return (
    <div className={cn('flex gap-2 px-4 py-1.5', right && 'flex-row-reverse')}>
      <SkeletonCircle className="w-7 h-7 shrink-0" />
      <div className={cn('space-y-1.5', right ? 'items-end' : 'items-start')}>
        <SkeletonLine className={right ? 'w-32' : 'w-40'} />
        <SkeletonLine className={right ? 'w-20' : 'w-52'} />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-[#0C0C14] p-4 space-y-3">
      <SkeletonLine className="w-20" />
      <SkeletonLine className="w-32 h-5" />
      <SkeletonLine className="w-full" />
    </div>
  );
}

export function DetailPanelSkeleton() {
  return (
    <div className="space-y-4 p-3">
      <SkeletonLine className="w-16" />
      <SkeletonBlock className="h-20 w-full" />
      <SkeletonLine className="w-20" />
      <SkeletonBlock className="h-16 w-full" />
      <SkeletonLine className="w-12" />
      <SkeletonBlock className="h-20 w-full" />
    </div>
  );
}
