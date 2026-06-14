'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types/unified';
import { Send, Loader2 } from 'lucide-react';

// ==================== Props ====================

interface UnifiedMessageComposerProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  platform?: Platform;
}

// ==================== Component ====================

export default function UnifiedMessageComposer({
  onSend,
  disabled = false,
  placeholder,
  platform = 'whatsapp',
}: UnifiedMessageComposerProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const accentClass =
    platform === 'discord'
      ? 'from-[#5865F2] to-[#4752c4] ring-[#5865F2]/30'
      : 'from-emerald-500 to-teal-500 ring-emerald-400/30';

  const defaultPlaceholder = disabled
    ? 'Assuma a conversa para enviar mensagens'
    : 'Digite sua mensagem...';

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [message]);

  const handleSend = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || disabled || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setMessage('');
      textareaRef.current?.focus();
    } catch {
      // Error handled by parent
    } finally {
      setSending(false);
    }
  }, [message, disabled, sending, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = message.trim().length > 0 && !disabled && !sending;

  return (
    <div className={cn('px-4 py-3 border-t border-white/[0.05]', disabled && 'opacity-60')}>
      <div className="flex items-end gap-2">
        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={placeholder || defaultPlaceholder}
            className={cn(
              'w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-3.5 py-2.5',
              'text-sm text-white placeholder-white/20 outline-none resize-none',
              'transition-all duration-200',
              'focus:border-white/10 focus:bg-white/[0.06]',
              disabled && 'cursor-not-allowed'
            )}
          />
          {/* Focus ring animation */}
          {!disabled && (
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              animate={{
                boxShadow: message
                  ? `0 0 0 1px rgba(16,185,129,0.2)`
                  : `0 0 0 0px rgba(16,185,129,0)`,
              }}
              transition={{ duration: 0.2 }}
            />
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200',
            canSend
              ? `bg-gradient-to-br ${accentClass} text-white shadow-lg hover:scale-105`
              : 'bg-white/[0.04] text-white/15 cursor-not-allowed'
          )}
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>

      {/* Helper text */}
      <p className="text-[10px] text-white/15 mt-1.5 text-center">
        Enter para enviar · Shift + Enter para nova linha
      </p>
    </div>
  );
}

export { type UnifiedMessageComposerProps };
