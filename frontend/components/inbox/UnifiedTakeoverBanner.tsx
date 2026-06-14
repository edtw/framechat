'use client';

import { cn } from '@/lib/utils';
import type { Platform } from '@/types/unified';
import { Bot, User, ArrowLeftRight, Loader2 } from 'lucide-react';

// ==================== Props ====================

interface UnifiedTakeoverBannerProps {
  isTakenOver: boolean;
  takenOverBy: string | null;
  platform: Platform;
  onTakeOver: () => void;
  onReturnToAI: () => void;
  loading?: boolean;
}

// ==================== Component ====================

export default function UnifiedTakeoverBanner({
  isTakenOver,
  takenOverBy,
  platform,
  onTakeOver,
  onReturnToAI,
  loading = false,
}: UnifiedTakeoverBannerProps) {
  const platformLabel = platform === 'discord' ? 'Discord' : 'WhatsApp';
  const isYou = takenOverBy === 'Você';

  if (isTakenOver) {
    return (
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-500/[0.08] via-indigo-500/[0.04] to-transparent border-b border-indigo-500/[0.08]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
              <User size={14} className="text-indigo-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {isYou
                  ? 'Você está gerenciando esta conversa'
                  : `${takenOverBy} está gerenciando esta conversa`}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <p className="text-[11px] text-indigo-300/70">
                  IA do {platformLabel} pausada
                </p>
              </div>
            </div>
          </div>
          {isYou && (
            <button
              onClick={onReturnToAI}
              disabled={loading}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                'bg-white/[0.06] border border-white/[0.08] text-white/60 hover:text-white hover:border-white/15'
              )}
            >
              {loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ArrowLeftRight size={12} />
              )}
              Devolver ao Agente
            </button>
          )}
        </div>
      </div>
    );
  }

  // AI-managed state
  return (
    <div className="px-4 py-3 bg-gradient-to-r from-white/[0.02] via-white/[0.01] to-transparent border-b border-white/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Bot size={14} className="text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">
              Agente está gerenciando esta conversa
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[11px] text-emerald-300/70">
                Respostas automáticas ativas no {platformLabel}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={onTakeOver}
          disabled={loading}
          className={cn(
            'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
          )}
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <User size={12} />
          )}
          Assumir Conversa
        </button>
      </div>
    </div>
  );
}

export { type UnifiedTakeoverBannerProps };
