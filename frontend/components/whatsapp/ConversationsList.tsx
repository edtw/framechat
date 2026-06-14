'use client';

import React, { useState, useMemo } from 'react';
import { cn, timeAgo } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/Input';

interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  unreadCount?: number;
}

interface ConversationsListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
  onSearch?: (query: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    'from-emerald-500 to-teal-500',
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-red-500',
    'from-indigo-500 to-violet-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function ConversationsList({
  conversations,
  selectedId,
  onSelect,
  onSearch,
}: ConversationsListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contactName.toLowerCase().includes(q) ||
        c.contactPhone.includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort(
      (a, b) =>
        new Date(b.lastMessageTime).getTime() -
        new Date(a.lastMessageTime).getTime()
    );
  }, [filtered]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-white/5">
        <Input
          icon={Search}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar conversas..."
          className="w-full"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {sorted.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 px-4 text-center"
            >
              <MessageCircle className="w-10 h-10 text-white/10 mb-3" />
              <p className="text-sm text-white/30">
                {searchQuery.trim()
                  ? 'Nenhuma conversa encontrada'
                  : 'Nenhuma conversa ativa'}
              </p>
            </motion.div>
          ) : (
            sorted.map((conv) => {
              const isActive = conv.id === selectedId;
              return (
                <motion.button
                  key={conv.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  onClick={() => onSelect(conv)}
                  className={cn(
                    'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors border-b border-white/5',
                    isActive
                      ? 'bg-emerald-500/10 border-l-2 border-l-emerald-400'
                      : 'hover:bg-white/[0.02]'
                  )}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full bg-gradient-to-r flex items-center justify-center',
                        getAvatarColor(conv.contactName)
                      )}
                    >
                      <span className="text-xs font-bold text-white">
                        {getInitials(conv.contactName)}
                      </span>
                    </div>
                    {/* Unread dot */}
                    {conv.unread && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-black" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4
                        className={cn(
                          'text-sm font-medium truncate',
                          conv.unread ? 'text-white' : 'text-white/70'
                        )}
                      >
                        {conv.contactName}
                      </h4>
                      <span className="text-[10px] text-white/30 flex-shrink-0 ml-2">
                        {timeAgo(conv.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-white/40 truncate max-w-[180px]">
                        {conv.lastMessage}
                      </p>
                      {conv.unread && conv.unreadCount != null && conv.unreadCount > 0 && (
                        <span className="flex-shrink-0 ml-2 min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-[10px] font-bold text-white flex items-center justify-center px-1">
                          {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
