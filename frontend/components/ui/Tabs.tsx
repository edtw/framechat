'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// ==================== Props ====================

interface Tab {
  id: string;
  label: string;
  icon?: React.ElementType;
  badge?: string | number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'pills' | 'underline';
  className?: string;
}

// ==================== Component ====================

export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = 'pills',
  className,
}: TabsProps) {
  return (
    <div
      className={cn(
        'flex gap-1',
        variant === 'pills' && 'p-0.5 bg-white/[0.03] rounded-lg',
        variant === 'underline' && 'border-b border-white/[0.05]',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              variant === 'pills' && (
                isActive
                  ? 'text-white'
                  : 'text-white/30 hover:text-white/50'
              ),
              variant === 'underline' && (
                isActive
                  ? 'text-white'
                  : 'text-white/30 hover:text-white/50'
              ),
              variant === 'underline' && 'rounded-none px-3 py-2.5'
            )}
          >
            {variant === 'pills' && isActive && (
              <motion.div
                layoutId="tab-active"
                className="absolute inset-0 bg-white/[0.08] rounded-md"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            {Icon && <Icon size={13} className="relative z-10" />}
            <span className="relative z-10">{tab.label}</span>
            {tab.badge != null && (
              <span className="relative z-10 text-[9px] bg-white/[0.08] px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
            {variant === 'underline' && isActive && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-full"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
