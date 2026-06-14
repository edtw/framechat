'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { UnifiedConversation, Platform } from '@/types/unified';
import {
  Search,
  MessageSquare,
  Bot,
  User,
  Hash,
  AlertTriangle,
} from 'lucide-react';

// ==================== Props ====================

interface UnifiedConversationsListProps {
  conversations: UnifiedConversation[];
  selectedId: string | null;
  onSelect: (conv: UnifiedConversation) => void;
  onSearch: (query: string) => void;
  platformFilter: Platform | 'all';
  onPlatformFilterChange: (f: Platform | 'all') => void;
  loading?: boolean;
}

// ==================== Helpers ====================

const AVATAR_GRADIENTS = [
  'from-emerald-400/30 to-teal-500/30',
  'from-blue-400/30 to-cyan-500/30',
  'from-purple-400/30 to-pink-500/30',
  'from-amber-400/30 to-orange-500/30',
  'from-rose-400/30 to-red-500/30',
  'from-indigo-400/30 to-violet-500/30',
];

function getGradient(name: string | null): string {
  if (!name) return AVATAR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string | null, fallback: string): string {
  if (!name) return fallback.slice(0, 2).toUpperCase();
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || fallback.slice(0, 2).toUpperCase();
}

function timeAgo(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts).getTime();
  const now = Date.now();
  const diff = now - d;
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

// ==================== Skeleton ====================

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div className="w-10 h-10 rounded-full bg-white/[0.04] skeleton shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 w-24 bg-white/[0.04] rounded skeleton" />
        <div className="h-3 w-40 bg-white/[0.03] rounded skeleton" />
      </div>
    </div>
  );
}

// ==================== Component ====================

export default function UnifiedConversationsList({
  conversations,
  selectedId,
  onSelect,
  onSearch,
  platformFilter,
  onPlatformFilterChange,
  loading = false,
}: UnifiedConversationsListProps) {
  const [searchVal, setSearchVal] = useState('');

  const FILTERS: { id: Platform | 'all'; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'discord', label: 'Discord' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0C0C14] border-r border-white/[0.05]">
      {/* Header with platform filter */}
      <div className="p-3 space-y-3 border-b border-white/[0.05]">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-1">
          Conversas
        </h2>
        {/* Filter pills */}
        <div className="flex gap-1 p-0.5 bg-white/[0.03] rounded-lg">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => onPlatformFilterChange(f.id)}
              className={cn(
                'flex-1 text-[11px] font-medium px-2 py-1.5 rounded-md transition-all',
                platformFilter === f.id
                  ? 'bg-white/[0.08] text-white shadow-sm'
                  : 'text-white/30 hover:text-white/50'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20"
          />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => {
              setSearchVal(e.target.value);
              onSearch(e.target.value);
            }}
            placeholder="Buscar conversas..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/10 focus:bg-white/[0.06] transition-all"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <ConversationSkeleton key={i} />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/20 px-4 text-center">
            <MessageSquare size={32} className="mb-3 opacity-40" />
            <p className="text-sm font-medium text-white/30">Nenhuma conversa</p>
            <p className="text-xs text-white/15 mt-1">
              As conversas do WhatsApp e Discord aparecerão aqui
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {conversations.map((conv) => {
              const active = conv.id === selectedId;
              const initials = getInitials(conv.contactName, conv.contactIdentifier);
              return (
                <motion.button
                  key={conv.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  onClick={() => onSelect(conv)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-3 text-left transition-all border-l-[3px]',
                    active
                      ? 'border-l-emerald-400 bg-emerald-500/[0.06]'
                      : 'border-l-transparent hover:bg-white/[0.02]'
                  )}
                >
                  {/* Avatar with platform badge */}
                  <div className="relative shrink-0">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold',
                        'bg-gradient-to-br border border-white/[0.06]',
                        getGradient(conv.contactName),
                        active ? 'text-white' : 'text-white/70'
                      )}
                    >
                      {initials}
                    </div>
                    {/* Platform badge */}
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border-2 border-[#0C0C14]',
                        conv.platform === 'discord'
                          ? 'bg-[#5865F2] text-white'
                          : 'bg-[#25D366] text-white'
                      )}
                    >
                      {conv.platform === 'discord' ? 'D' : 'W'}
                    </span>
                    {/* Unread dot */}
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0C0C14]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white truncate">
                        {conv.contactName || conv.contactIdentifier.slice(0, 12)}
                      </span>
                      <span className="text-[10px] text-white/25 shrink-0">
                        {timeAgo(conv.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-white/30 truncate flex-1">
                        {conv.lastMessage || 'Nova conversa'}
                      </p>
                      {/* Status badges */}
                      {conv.isTakenOver ? (
                        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          <User size={8} className="inline mr-0.5" />
                          Você
                        </span>
                      ) : (
                        <span className="text-[9px] bg-white/[0.04] text-white/25 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          <Bot size={8} className="inline mr-0.5" />
                          IA
                        </span>
                      )}
                      {conv.contactMissing && (
                        <AlertTriangle size={10} className="text-amber-400 shrink-0" />
                      )}
                    </div>
                    {/* Lead info */}
                    {conv.leadScore != null && (
                      <div className="flex items-center gap-1 mt-1">
                        <span
                          className={cn(
                            'text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                            conv.leadScore >= 80
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : conv.leadScore >= 50
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-rose-500/15 text-rose-300'
                          )}
                        >
                          {conv.leadScore}pts
                        </span>
                        {conv.lifecycleStage && (
                          <span className="text-[9px] bg-purple-500/15 text-purple-300 px-1.5 py-0.5 rounded-full">
                            {conv.lifecycleStage}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Footer: count */}
      <div className="px-3 py-2 border-t border-white/[0.05]">
        <p className="text-[10px] text-white/20">
          {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}

export { type UnifiedConversationsListProps };
