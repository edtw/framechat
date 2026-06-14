'use client';

import { cn } from '@/lib/utils';

// ==================== Props ====================

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  status?: 'online' | 'offline' | 'away';
  className?: string;
}

// ==================== Helpers ====================

const GRADIENTS = [
  'from-emerald-400/30 to-teal-500/30',
  'from-blue-400/30 to-cyan-500/30',
  'from-purple-400/30 to-pink-500/30',
  'from-amber-400/30 to-orange-500/30',
  'from-rose-400/30 to-red-500/30',
  'from-indigo-400/30 to-violet-500/30',
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

const SIZE_CLASSES = {
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-12 h-12 text-sm',
};

const STATUS_COLORS = {
  online: 'bg-emerald-500',
  offline: 'bg-white/20',
  away: 'bg-amber-500',
};

// ==================== Component ====================

export function Avatar({
  src,
  name,
  size = 'md',
  status,
  className,
}: AvatarProps) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(
            'rounded-full object-cover border border-white/[0.06]',
            SIZE_CLASSES[size]
          )}
        />
      ) : (
        <div
          className={cn(
            'rounded-full flex items-center justify-center font-bold border border-white/[0.06]',
            'bg-gradient-to-br text-white/70',
            getGradient(name),
            SIZE_CLASSES[size]
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {status && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[#0A0A0F]',
            STATUS_COLORS[status],
            size === 'sm' ? 'w-2.5 h-2.5' : size === 'lg' ? 'w-3.5 h-3.5' : 'w-3 h-3'
          )}
        />
      )}
    </div>
  );
}
