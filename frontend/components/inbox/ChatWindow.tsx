'use client';

import { useEffect, useRef } from 'react';
import { MoreVertical, Phone, Video, UserCircle, MessageSquare, Check, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import TakeoverBanner from './TakeoverBanner';
import MessageComposer from './MessageComposer';

interface Message {
  id: string;
  from_number: string;
  to_number: string;
  message_text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: string;
  status?: string;
}

interface ChatWindowProps {
  conversation: {
    userNumber: string;
    userName?: string;
    isOnline?: boolean;
  } | null;
  messages: Message[];
  isTakenOver: boolean;
  takenOverBy?: string;
  onTakeOver: () => void;
  onReturnToAI: () => void;
  onSendMessage: (message: string) => Promise<void>;
  loading?: boolean;
  onShowLeadPanel?: () => void;
}

export default function ChatWindow({
  conversation,
  messages,
  isTakenOver,
  takenOverBy,
  onTakeOver,
  onReturnToAI,
  onSendMessage,
  loading = false,
  onShowLeadPanel
}: ChatWindowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastConversationRef = useRef<string | null>(null);

  // Scroll only when a new conversation (thread) is selected
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (conversation?.userNumber && conversation.userNumber !== lastConversationRef.current) {
      lastConversationRef.current = conversation.userNumber;
      container.scrollTop = container.scrollHeight;
    }
  }, [conversation?.userNumber]);

  if (!conversation) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-br from-[#0a0f21] to-[#060710] relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-[0.015]">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-sm"
          >
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 mx-auto mb-6 flex items-center justify-center border border-white/10 backdrop-blur-xl">
              <MessageSquare className="w-12 h-12 text-white/30" />
            </div>
            <h3 className="text-lg font-light text-white mb-2">
              Nenhuma conversa selecionada
            </h3>
            <p className="text-sm text-white/60">
              Selecione uma conversa da lista para começar
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-[#0a0f21] via-[#060710] to-[#030510] relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.015]">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-white/5 bg-white/[0.02] backdrop-blur-xl px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
              <span className="text-sm font-medium text-white/90">
                {conversation.userName?.charAt(0)?.toUpperCase() || conversation.userNumber.slice(-2)}
              </span>
            </div>

            {/* Info */}
            <div>
              <h2 className="text-base font-medium text-white">
                {conversation.userName || conversation.userNumber}
              </h2>
              <p className="text-xs text-white/60 flex items-center gap-1.5">
                {conversation.isOnline ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Online
                  </>
                ) : (
                  conversation.userNumber
                )}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {onShowLeadPanel && (
              <button
                onClick={onShowLeadPanel}
                className="p-2.5 hover:bg-white/10 rounded-xl transition-all duration-200 group"
                title="Ver informações do contato"
              >
                <UserCircle className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
              </button>
            )}
            <button className="p-2.5 hover:bg-white/10 rounded-xl transition-all duration-200 group">
              <Phone className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            </button>
            <button className="p-2.5 hover:bg-white/10 rounded-xl transition-all duration-200 group">
              <Video className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            </button>
            <button className="p-2.5 hover:bg-white/10 rounded-xl transition-all duration-200 group">
              <MoreVertical className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      </div>

      {/* Takeover Banner */}
      <TakeoverBanner
        isTakenOver={isTakenOver}
        takenOverBy={takenOverBy}
        onTakeOver={onTakeOver}
        onReturnToAI={onReturnToAI}
        loading={loading}
      />

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="relative z-10 flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar"
      >
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center h-full"
          >
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 backdrop-blur-xl">
                <MessageSquare className="w-8 h-8 text-white/30" />
              </div>
              <p className="text-sm text-white/60 font-light">
                Nenhuma mensagem ainda. Inicie a conversa!
              </p>
            </div>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message, index) => {
              const isIncoming = message.direction === 'incoming';
              const showTimestamp = index === 0 ||
                new Date(message.timestamp).getTime() - new Date(messages[index - 1].timestamp).getTime() > 300000; // 5 min

              return (
                <div key={message.id}>
                  {/* Timestamp divider */}
                  {showTimestamp && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center my-6"
                    >
                      <span className="text-[11px] text-white/40 bg-white/5 px-3 py-1.5 rounded-full backdrop-blur-xl border border-white/10">
                        {format(new Date(message.timestamp), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </motion.div>
                  )}

                  {/* Message bubble */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[75%] sm:max-w-md px-4 py-2.5 rounded-2xl shadow-lg relative group ${
                        isIncoming
                          ? 'bg-white/[0.08] text-white border border-white/10 rounded-tl-md backdrop-blur-xl'
                          : 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-tr-md shadow-indigo-500/25'
                      }`}
                    >
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                        {message.message_text}
                      </p>
                      <div className={`flex items-center gap-1.5 mt-1.5 ${isIncoming ? 'justify-start' : 'justify-end'}`}>
                        <span
                          className={`text-[10px] ${
                            isIncoming ? 'text-white/50' : 'text-white/70'
                          }`}
                        >
                          {format(new Date(message.timestamp), 'HH:mm')}
                        </span>
                        {!isIncoming && (
                          <span className="text-white/70">
                            {message.status === 'read' ? (
                              <CheckCheck className="w-3.5 h-3.5" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Message tail */}
                      <div
                        className={`absolute top-0 ${
                          isIncoming
                            ? '-left-1.5 border-l-8 border-l-transparent border-t-8 border-t-white/[0.08]'
                            : '-right-1.5 border-r-8 border-r-transparent border-t-8 border-t-indigo-500'
                        } w-0 h-0`}
                        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
                      />
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </AnimatePresence>
        )}
        <div />
      </div>

      {/* Composer */}
      <MessageComposer
        onSend={onSendMessage}
        disabled={!isTakenOver}
        placeholder={
          isTakenOver
            ? 'Digite uma mensagem...'
            : 'Assuma a conversa para enviar mensagens'
        }
      />

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
