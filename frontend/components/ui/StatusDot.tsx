'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface StatusDotProps {
  status: 'online' | 'offline' | 'connecting';
  className?: string;
}

const statusClasses: Record<string, string> = {
  online: 'bg-emerald-400',
  offline: 'bg-gray-500',
  connecting: 'bg-amber-400',
};

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span className={cn('relative flex h-2.5 w-2.5', className)}>
      {/* Pulse ring for online status */}
      {status === 'online' && (
        <motion.span
          className="absolute inset-0 rounded-full bg-emerald-400"
          animate={{ opacity: [1, 0, 1], scale: [1, 1.8, 1] }}
          transition={{
            repeat: Infinity,
            duration: 2,
            ease: 'easeInOut',
          }}
        />
      )}
      {/* Core dot */}
      <span
        className={cn(
          'relative block h-2.5 w-2.5 rounded-full',
          statusClasses[status]
        )}
      />
    </span>
  );
}
