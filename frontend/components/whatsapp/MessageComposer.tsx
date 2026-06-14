'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

interface MessageComposerProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function MessageComposer({
  onSend,
  disabled = false,
}: MessageComposerProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [content]);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setContent('');

    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = content.trim().length > 0 && !disabled;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-end gap-2 p-3 border-t border-white/10',
        disabled && 'opacity-50'
      )}
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'Selecione uma conversa...' : 'Digite sua mensagem...'}
        rows={1}
        className={cn(
          'flex-1 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30',
          'focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30',
          'transition-colors resize-none backdrop-blur-sm',
          disabled && 'cursor-not-allowed'
        )}
      />
      <motion.button
        onClick={handleSend}
        disabled={!canSend}
        whileHover={canSend ? { scale: 1.05 } : undefined}
        whileTap={canSend ? { scale: 0.95 } : undefined}
        className={cn(
          'flex-shrink-0 p-2.5 rounded-xl transition-all',
          canSend
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 cursor-pointer'
            : 'bg-white/5 text-white/20 cursor-not-allowed'
        )}
        aria-label="Send message"
      >
        <Send className="w-4 h-4" />
      </motion.button>
    </motion.div>
  );
}
