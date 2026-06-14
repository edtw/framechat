'use client';

import React, { useRef, useEffect } from 'react';
import { cn, formatDateTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Bot } from 'lucide-react';

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'lead' | 'ai';
  timestamp: string;
  aiGenerated?: boolean;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage?: (content: string) => void;
  loading?: boolean;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isSent = message.sender === 'user';
  const isAI = message.sender === 'ai' || message.aiGenerated;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        'flex mb-3',
        isSent ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5',
          isSent
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-br-md'
            : isAI
              ? 'bg-purple-500/20 border border-purple-500/30 text-white/90 rounded-bl-md'
              : 'bg-white/[0.05] border border-white/10 text-white/80 rounded-bl-md'
        )}
      >
        {/* AI badge */}
        {isAI && (
          <div className="flex items-center gap-1 mb-1">
            <Bot className="w-3 h-3 text-purple-400" />
            <span className="text-[10px] font-medium text-purple-400">
              AI
            </span>
          </div>
        )}

        <p className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </p>
        <span
          className={cn(
            'block text-[10px] mt-1',
            isSent ? 'text-emerald-100' : 'text-white/30'
          )}
        >
          {formatDateTime(message.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            'flex',
            i % 2 === 0 ? 'justify-end' : 'justify-start'
          )}
        >
          <div
            className={cn(
              'rounded-2xl px-4 py-3 animate-pulse',
              i % 2 === 0
                ? 'w-48 bg-emerald-500/10 rounded-br-md'
                : 'w-64 bg-white/5 rounded-bl-md'
            )}
          >
            <div className="h-3 bg-white/10 rounded mb-2 w-full" />
            <div className="h-3 bg-white/10 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatWindow({
  messages,
  loading = false,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <LoadingSkeleton />
      </div>
    );
  }

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-white/20" />
          </div>
          <h3 className="text-sm font-medium text-white/40 mb-1">
            Nenhuma mensagem
          </h3>
          <p className="text-xs text-white/20">
            Inicie uma conversa para comecar
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 space-y-1"
    >
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </AnimatePresence>
    </div>
  );
}
