'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';
import { motion } from 'framer-motion';

interface MessageComposerProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export default function MessageComposer({
  onSend,
  disabled = false,
  placeholder = 'Digite uma mensagem...'
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSend = async () => {
    if (!message.trim() || sending || disabled) return;

    setSending(true);
    try {
      await onSend(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Falha ao enviar mensagem:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative z-10 border-t border-white/5 bg-white/[0.02] backdrop-blur-xl p-4">
      <div className="flex items-end gap-3">
        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            disabled={disabled}
            className="p-2.5 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed group"
            title="Anexar arquivo"
          >
            <Paperclip className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          </button>
          <button
            disabled={disabled}
            className="p-2.5 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed group"
            title="Emoji"
          >
            <Smile className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <motion.div
            animate={{
              boxShadow: isFocused
                ? '0 0 0 2px rgba(99, 102, 241, 0.3)'
                : '0 0 0 0px rgba(99, 102, 241, 0)',
            }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl overflow-hidden"
          >
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              disabled={disabled || sending}
              rows={1}
              className="w-full px-4 py-3 pr-14 bg-white/[0.08] border border-white/10 text-white placeholder:text-white/40 rounded-2xl resize-none focus:outline-none focus:border-indigo-500/50 disabled:bg-white/[0.03] disabled:cursor-not-allowed max-h-32 text-sm transition-all"
              style={{ minHeight: '48px' }}
            />
          </motion.div>

          {/* Send button */}
          <motion.button
            onClick={handleSend}
            disabled={!message.trim() || sending || disabled}
            whileHover={{ scale: message.trim() && !disabled ? 1.05 : 1 }}
            whileTap={{ scale: message.trim() && !disabled ? 0.95 : 1 }}
            className={`absolute right-2 bottom-2 p-2.5 rounded-xl transition-all duration-200 ${
              message.trim() && !disabled && !sending
                ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </motion.button>
        </div>
      </div>

      {/* Helper text */}
      {!disabled && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mt-2"
        >
          <p className="text-[10px] text-white/40">
            <span className="hidden sm:inline">Pressione Enter para enviar, Shift + Enter para nova linha</span>
            <span className="sm:hidden">Enter envia • Shift+Enter nova linha</span>
          </p>
        </motion.div>
      )}
    </div>
  );
}
