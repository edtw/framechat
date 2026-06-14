'use client';

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { UnifiedConversation, UnifiedMessage, Platform } from '@/types/unified';
import UnifiedTakeoverBanner from './UnifiedTakeoverBanner';
import UnifiedMessageComposer from './UnifiedMessageComposer';
import {
  MessageSquare,
  User,
  Bot,
  PanelRightOpen,
  PanelRightClose,
  Hash,
  ArrowDown,
  Loader2,
} from 'lucide-react';

// ==================== Props ====================

interface UnifiedChatWindowProps {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isTakenOver: boolean;
  takenOverBy: string | null;
  takeoverLoading?: boolean;
  onTakeOver: () => void;
  onReturnToAI: () => void;
  onSendMessage: (body: string) => Promise<void>;
  sending?: boolean;
  detailOpen: boolean;
  onToggleDetail: () => void;
}

// ==================== Helpers ====================

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Ontem ${time}`;
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ` ${time}`;
}

function shouldShowDivider(
  msg: UnifiedMessage,
  prev: UnifiedMessage | null
): boolean {
  if (!prev) return true;
  const diff = new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime();
  return diff > 300000; // 5 minutes
}

function getInitials(name: string | null, fallback: string): string {
  if (!name) return fallback.slice(0, 2).toUpperCase();
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ==================== Skeleton ====================

function MessageSkeleton({ right }: { right?: boolean }) {
  return (
    <div className={cn('flex gap-2 px-4 py-1.5', right && 'flex-row-reverse')}>
      <div className="w-7 h-7 rounded-full bg-white/[0.04] skeleton shrink-0" />
      <div className={cn('space-y-1.5', right ? 'items-end' : 'items-start')}>
        <div className={cn('h-3 bg-white/[0.04] rounded skeleton', right ? 'w-32' : 'w-40')} />
        <div className={cn('h-3 bg-white/[0.03] rounded skeleton', right ? 'w-20' : 'w-52')} />
      </div>
    </div>
  );
}

// ==================== Component ====================

export default function UnifiedChatWindow({
  conversation,
  messages,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  isTakenOver,
  takenOverBy,
  takeoverLoading = false,
  onTakeOver,
  onReturnToAI,
  onSendMessage,
  sending = false,
  detailOpen,
  onToggleDetail,
}: UnifiedChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(messages.length);

  const platform = conversation?.platform || 'whatsapp';
  const accentBorder =
    platform === 'discord' ? 'border-[#5865F2]' : 'border-emerald-500';
  const accentBg =
    platform === 'discord'
      ? 'from-[#5865F2] to-[#4752c4]'
      : 'from-emerald-500 to-teal-500';
  const accentText =
    platform === 'discord' ? 'text-[#5865F2]' : 'text-emerald-400';

  // Auto-scroll to bottom when new messages arrive (only if already near bottom)
  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }, []);

  useEffect(() => {
    if (messages.length > prevMsgCount.current && isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, isNearBottom]);

  // Scroll to bottom on conversation change
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [conversation?.id]);

  // No conversation selected
  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-[#0A0A0F]">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
          <MessageSquare size={28} className="text-white/15" />
        </div>
        <p className="text-sm font-medium text-white/20">Nenhuma conversa selecionada</p>
        <p className="text-xs text-white/10 mt-1 max-w-56 text-center">
          Selecione uma conversa do WhatsApp ou Discord para começar
        </p>
      </div>
    );
  }

  const initials = getInitials(conversation.contactName, conversation.contactIdentifier);
  const name = conversation.contactName || conversation.contactIdentifier.slice(0, 15);
  const isDiscord = platform === 'discord';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0F]">
      {/* ===== HEADER ===== */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] shrink-0">
        {/* Avatar */}
        <div
          className={cn(
            'w-9 h-9 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.03]',
            'border border-white/[0.06] flex items-center justify-center text-xs font-bold text-white/60 shrink-0'
          )}
        >
          {initials}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{name}</p>
            {/* Platform badge */}
            <span
              className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                isDiscord
                  ? 'bg-[#5865F2]/20 text-[#5865F2]'
                  : 'bg-[#25D366]/20 text-[#25D366]'
              )}
            >
              {isDiscord ? 'DISCORD' : 'WHATSAPP'}
            </span>
          </div>
          <p className="text-[11px] text-white/25 truncate">
            {isDiscord && (conversation.metadata as any)?.guildName
              ? `${(conversation.metadata as any).guildName} · `
              : ''}
            {conversation.contactIdentifier.slice(0, 24)}
            {isDiscord && (conversation.metadata as any)?.channelType === 'GUILD_TEXT'
              ? ' (servidor)'
              : ''}
          </p>
        </div>

        {/* Actions */}
        <button
          onClick={onToggleDetail}
          className={cn(
            'p-2 rounded-lg transition-colors',
            detailOpen
              ? 'bg-white/[0.06] text-white/60'
              : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
          )}
          title={detailOpen ? 'Fechar painel' : 'Abrir detalhes'}
        >
          {detailOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>

      {/* ===== TAKEOVER BANNER ===== */}
      <UnifiedTakeoverBanner
        isTakenOver={isTakenOver}
        takenOverBy={takenOverBy}
        platform={platform}
        onTakeOver={onTakeOver}
        onReturnToAI={onReturnToAI}
        loading={takeoverLoading}
      />

      {/* ===== MESSAGE LIST ===== */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Load-more trigger */}
        {hasMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="text-xs text-white/30 hover:text-white/50 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-all disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 size={12} className="animate-spin inline mr-1" />
              ) : null}
              Carregar mais
            </button>
          </div>
        )}

        {loading ? (
          <div className="px-3 py-4 space-y-2">
            <MessageSkeleton />
            <MessageSkeleton right />
            <MessageSkeleton />
            <MessageSkeleton right />
            <MessageSkeleton />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-white/15">
            <MessageSquare size={36} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-white/20">Nenhuma mensagem ainda</p>
            <p className="text-xs text-white/10 mt-1">
              {isTakenOver
                ? 'Envie a primeira mensagem!'
                : 'O agente IA responderá quando chegar uma mensagem'}
            </p>
          </div>
        ) : (
          <div className="py-3">
            <AnimatePresence>
              {messages.map((msg, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const showDivider = shouldShowDivider(msg, prev);
                const isOut = msg.fromMe || msg.direction === 'outgoing';

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Timestamp divider */}
                    {showDivider && (
                      <div className="flex items-center gap-3 px-4 py-2">
                        <div className="flex-1 h-px bg-white/[0.04]" />
                        <span className="text-[10px] text-white/20 shrink-0">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={cn(
                        'flex gap-2 px-4 py-1',
                        isOut && 'flex-row-reverse'
                      )}
                    >
                      {/* Mini avatar */}
                      <div
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                          isOut
                            ? `bg-gradient-to-br ${accentBg} text-white text-[9px] font-bold`
                            : 'bg-white/[0.06] text-white/30 text-[9px] font-bold'
                        )}
                      >
                        {isOut ? initials : (msg.aiProcessed ? <Bot size={10} /> : <User size={10} />)}
                      </div>

                      {/* Bubble content */}
                      <div
                        className={cn(
                          'max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                          isOut
                            ? `bg-gradient-to-br ${accentBg} text-white rounded-tr-md`
                            : 'bg-white/[0.05] border border-white/[0.06] text-white/80 rounded-tl-md'
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.body || ''}</p>
                        <div
                          className={cn(
                            'flex items-center gap-1.5 mt-1',
                            isOut ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <span className={cn('text-[10px]', isOut ? 'text-white/50' : 'text-white/20')}>
                            {formatTimestamp(msg.timestamp)}
                          </span>
                          {msg.aiProcessed && (
                            <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1 py-0 rounded font-medium">
                              AI
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ===== COMPOSER ===== */}
      <UnifiedMessageComposer
        onSend={onSendMessage}
        disabled={!isTakenOver}
        platform={platform}
      />
    </div>
  );
}

export { type UnifiedChatWindowProps };
