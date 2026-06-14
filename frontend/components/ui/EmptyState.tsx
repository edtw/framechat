'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

// ==================== Props ====================

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

// ==================== Component ====================

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center',
        className
      )}
    >
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
          <Icon size={24} className="text-white/15" />
        </div>
      )}
      <p className="text-sm font-medium text-white/25">{title}</p>
      {description && (
        <p className="text-xs text-white/12 mt-1.5 max-w-64">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs font-medium text-white/50 hover:text-white hover:border-white/15 transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
