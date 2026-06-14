'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWhatsAppApi } from '@/hooks/useWhatsAppApi';
import { useAuthStore } from '@/stores/authStore';
import { timeAgo, cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  Send,
  MessageCircle,
  Users,
  User,
  AlertCircle,
  Paperclip,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface Conversation {
  id: string | number;
  contactName: string;
  contactPhone: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  groupChat?: boolean;
  isTakenOver?: boolean;
  takenOverBy?: string;
}

interface ChatMessage {
  id: string | number;
  text: string;
  fromMe: boolean;
  createdAt: string;
  status?: string;
}

/* ── Conversations List ── */
function ConversationsList({
  conversations,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  loading,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  loading: boolean;
}) {
  const filtered = conversations.filter(
    (c) =>
      !search ||
      c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPhone.includes(search)
  );

  return (
    <div className="flex flex-col h-full border-r border-white/10">
      {/* Search */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-white/5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-white/5 rounded w-24" />
                  <div className="h-2 bg-white/5 rounded w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-white/30 text-center py-10">Nenhuma conversa encontrada.</p>
        ) : (
          filtered.map((conv) => {
            const sid = String(conv.id);
            const isActive = sid === selectedId;
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(sid)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-white/5',
                  isActive ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500' : 'hover:bg-white/5'
                )}
              >
                <div className="relative shrink-0">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold',
                    conv.groupChat
                      ? 'bg-gradient-to-br from-blue-400/30 to-cyan-500/30'
                      : 'bg-gradient-to-br from-emerald-400/30 to-teal-500/30'
                  )}>
                    {conv.groupChat ? <Users size={14} /> : conv.contactName.charAt(0).toUpperCase()}
                  </div>
                  {/* Taken over indicator */}
                  {conv.isTakenOver && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-[#0A0A0F]" title="Assumido por operador" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white truncate">
                      {conv.contactName}
                      {conv.groupChat && <span className="text-[10px] text-white/30 ml-1">(Grupo)</span>}
                    </span>
                    {conv.lastMessageAt && (
                      <span className="text-[10px] text-white/40 shrink-0 ml-2">{timeAgo(conv.lastMessageAt)}</span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 truncate mt-0.5">{conv.lastMessage || conv.contactPhone}</p>
                </div>
                {conv.unreadCount != null && conv.unreadCount > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Chat Window ── */
function ChatWindow({
  messages,
  loading,
  selectedConv,
  isTyping,
}: {
  messages: ChatMessage[];
  loading: boolean;
  selectedConv: Conversation | null;
  isTyping: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-3 shrink-0">
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
          selectedConv?.groupChat
            ? 'bg-gradient-to-br from-blue-400/30 to-cyan-500/30'
            : 'bg-gradient-to-br from-emerald-400/30 to-teal-500/30'
        )}>
          {selectedConv?.groupChat ? <Users size={14} /> : (selectedConv?.contactName || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{selectedConv?.contactName || 'Contato'}</p>
            {selectedConv?.groupChat && (
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full shrink-0">Grupo</span>
            )}
          </div>
          <p className="text-xs text-white/40">
            {isTyping ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <Loader2 size={10} className="animate-spin" />
                Digitando...
              </span>
            ) : (
              selectedConv?.contactPhone || 'online'
            )}
          </p>
        </div>

        {/* Connection status */}
        <div className="ml-auto flex items-center gap-2">
          <span title="Conectado"><Wifi size={14} className="text-emerald-400" /></span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-emerald-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/30">
            <MessageCircle size={40} className="mb-3" />
            <p className="text-sm">Nenhuma mensagem ainda.</p>
            {selectedConv?.groupChat && (
              <p className="text-xs mt-1">Mensagens de grupos nao recebem resposta automatica.</p>
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isMine = msg.fromMe;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm',
                      isMine
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-br-md'
                        : 'bg-white/[0.06] text-white/90 border border-white/10 rounded-bl-md'
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <div className={cn('flex items-center gap-1 mt-1', isMine ? 'justify-end' : 'justify-start')}>
                      <span className="text-[10px] text-white/40">{timeAgo(msg.createdAt)}</span>
                      {isMine && msg.status && (
                        <span className="text-[10px] text-white/60">
                          {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 pl-2"
          >
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[10px] text-emerald-400/70">IA respondendo...</span>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ── Takeover Banner ── */
function TakeoverBanner({
  isTakenOver,
  takenOverBy,
  onTakeOver,
  onReturnToAI,
  loading: actionLoading,
}: {
  isTakenOver: boolean;
  takenOverBy?: string;
  onTakeOver: () => void;
  onReturnToAI: () => void;
  loading: boolean;
}) {
  return (
    <div className={cn(
      'px-4 py-2.5 border-b shrink-0 flex items-center justify-between gap-3',
      isTakenOver
        ? 'bg-indigo-500/10 border-indigo-500/20'
        : 'bg-white/[0.02] border-white/5'
    )}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn(
          'w-2 h-2 rounded-full animate-pulse shrink-0',
          isTakenOver ? 'bg-indigo-400' : 'bg-emerald-400'
        )} />
        <p className="text-xs text-white/60 truncate">
          {isTakenOver
            ? `${takenOverBy || 'Operador'} gerenciando — IA pausada`
            : 'IA respondendo automaticamente'}
        </p>
      </div>
      <button
        onClick={isTakenOver ? onReturnToAI : onTakeOver}
        disabled={actionLoading}
        className={cn(
          'text-xs font-medium px-3 py-1.5 rounded-lg transition-all shrink-0 disabled:opacity-50',
          isTakenOver
            ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
            : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
        )}
      >
        {actionLoading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : isTakenOver ? (
          'Devolver para IA'
        ) : (
          'Assumir Conversa'
        )}
      </button>
    </div>
  );
}

/* ── Message Composer ── */
function MessageComposer({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 border-t border-white/10 flex items-center gap-2 shrink-0">
      <button className="p-2 text-white/40 hover:text-white transition-colors" title="Anexar" aria-label="Anexar arquivo">
        <Paperclip size={18} />
      </button>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Selecione uma conversa...' : 'Digite sua mensagem...'}
        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50"
        disabled={disabled}
        aria-label="Mensagem"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-emerald-500/20"
        aria-label="Enviar mensagem"
      >
        <Send size={16} />
      </button>
    </div>
  );
}

/* ── Main Page ── */
export default function WhatsAppInboxPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { user } = useAuthStore();
  const { fetchConversations, fetchMessages, sendMessage, takeOver, returnToAI, checkTakeoverStatus } = useWhatsAppApi();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isTakenOver, setIsTakenOver] = useState(false);
  const [takenOverBy, setTakenOverBy] = useState<string | undefined>();
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConversations(sessionId);
      if (mountedRef.current) setConversations(data || []);
    } catch {
      if (mountedRef.current) setError('Erro ao carregar conversas.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [sessionId, fetchConversations]);

  const loadMessages = useCallback(async (convId: string) => {
    setMsgsLoading(true);
    try {
      const data = await fetchMessages(convId);
      if (mountedRef.current) setMessages(data || []);
    } catch {
      /* silent */
    } finally {
      if (mountedRef.current) setMsgsLoading(false);
    }
  }, [fetchMessages]);

  const loadTakeoverStatus = useCallback(async (conv: Conversation) => {
    try {
      const phone = conv.contactPhone;
      if (phone && sessionId) {
        const status = await checkTakeoverStatus(sessionId, phone);
        if (mountedRef.current) {
          setIsTakenOver(status?.isTakenOver || false);
          setTakenOverBy(status?.takenOverBy || undefined);
        }
      }
    } catch {
      /* silent */
    }
  }, [sessionId, checkTakeoverStatus]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto-select first conversation
  useEffect(() => {
    if (conversations.length > 0 && !selectedConvId) {
      const firstId = String(conversations[0].id);
      setSelectedConvId(firstId);
      setSelectedConv(conversations[0]);
      loadMessages(firstId);
      loadTakeoverStatus(conversations[0]);
    }
  }, [conversations, selectedConvId, loadMessages, loadTakeoverStatus]);

  // Reset takeover state when switching conversations
  useEffect(() => {
    if (selectedConv) {
      loadTakeoverStatus(selectedConv);
    }
  }, [selectedConv, loadTakeoverStatus]);

  const handleSelectConversation = (convId: string) => {
    setSelectedConvId(convId);
    const conv = conversations.find(c => String(c.id) === convId) || null;
    setSelectedConv(conv);
    loadMessages(convId);
    if (conv) loadTakeoverStatus(conv);
  };

  const handleSend = async (text: string) => {
    if (!selectedConvId || !selectedConv) return;
    // Optimistic
    const tempMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      text,
      fromMe: true,
      createdAt: new Date().toISOString(),
      status: 'sent',
    };
    setMessages((prev) => [...prev, tempMsg]);
    try {
      await sendMessage(sessionId, selectedConv.contactPhone, text);

      // Update last message optimistically
      setConversations((prev) =>
        prev.map((c) =>
          String(c.id) === selectedConvId
            ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() }
            : c
        )
      );
    } catch {
      /* silent */
    }
  };

  const handleTakeOver = async () => {
    if (!selectedConv) return;
    setActionLoading(true);
    try {
      await takeOver(sessionId, selectedConv.contactPhone);
      if (mountedRef.current) {
        setIsTakenOver(true);
        setTakenOverBy(user?.name || 'Voce');
      }
    } catch {
      /* silent */
    } finally {
      if (mountedRef.current) setActionLoading(false);
    }
  };

  const handleReturnToAI = async () => {
    if (!selectedConv) return;
    setActionLoading(true);
    try {
      await returnToAI(sessionId, selectedConv.contactPhone);
      if (mountedRef.current) {
        setIsTakenOver(false);
        setTakenOverBy(undefined);
      }
    } catch {
      /* silent */
    } finally {
      if (mountedRef.current) setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="h-screen flex flex-col p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <button onClick={() => router.push('/whatsapp')} className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors">
            <ArrowLeft size={16} /> Voltar
          </button>
          <h1 className="text-lg font-semibold text-white">Chat</h1>
          <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{sessionId}</span>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 mb-3 shrink-0">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Inbox Layout */}
        <div className="flex flex-1 bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden min-h-0">
          {/* Left Panel: Conversations */}
          <div className="w-72 lg:w-80 shrink-0">
            <ConversationsList
              conversations={conversations}
              selectedId={selectedConvId}
              onSelect={handleSelectConversation}
              search={search}
              onSearchChange={setSearch}
              loading={loading}
            />
          </div>

          {/* Right: Chat */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedConvId ? (
              <>
                <TakeoverBanner
                  isTakenOver={isTakenOver}
                  takenOverBy={takenOverBy}
                  onTakeOver={handleTakeOver}
                  onReturnToAI={handleReturnToAI}
                  loading={actionLoading}
                />
                <ChatWindow
                  messages={messages}
                  loading={msgsLoading}
                  selectedConv={selectedConv}
                  isTyping={isTyping}
                />
                <MessageComposer onSend={handleSend} disabled={!selectedConvId} />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-white/30">
                <MessageCircle size={40} className="mb-3" />
                <p className="text-sm">Selecione uma conversa para iniciar.</p>
                <p className="text-xs mt-1 text-white/20">As mensagens serao carregadas aqui</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
