'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface DiscordToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * A toggle styled like Discord's settings switches:
 * red/gray when off, green (#23a55a) when on, with a sliding white knob.
 */
export default function DiscordToggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: DiscordToggleProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-3 border-b border-[#3f4147] last:border-b-0',
        disabled && 'opacity-50'
      )}
    >
      <div className="pr-4">
        <p className="text-[15px] font-medium text-[#dbdee1]">{label}</p>
        {description && (
          <p className="text-[13px] text-[#949ba4] mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-[#23a55a]' : 'bg-[#80848e]',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}
