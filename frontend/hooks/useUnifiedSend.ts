'use client';

import { useState, useCallback } from 'react';
import api from '@/lib/api';
import type { Platform, DiscordConversationMeta, WhatsAppConversationMeta } from '@/types/unified';

interface UseUnifiedSendOptions {
  platform: Platform;
  /** The native platform conversation ID (no prefix). */
  conversationId: string;
  metadata?: DiscordConversationMeta | WhatsAppConversationMeta | null;
}

interface UseUnifiedSendReturn {
  sendMessage: (body: string) => Promise<void>;
  sending: boolean;
  error: string | null;
}

export function useUnifiedSend(options: UseUnifiedSendOptions): UseUnifiedSendReturn {
  const { platform, conversationId, metadata } = options;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!body.trim()) return;
      setSending(true);
      setError(null);
      try {
        if (platform === 'discord') {
          await api.post(`/api/discord/conversations/${conversationId}/send-message`, { body });
        } else {
          const meta = metadata as WhatsAppConversationMeta | undefined;
          await api.post('/api/whatsapp/conversations/send-message', {
            sessionId: meta?.sessionId || '',
            userPhone: meta?.contactNumber || meta?.userNumber || '',
            message: body,
            type: 'text',
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to send message';
        setError(msg);
        throw e;
      } finally {
        setSending(false);
      }
    },
    [platform, conversationId, metadata]
  );

  return { sendMessage, sending, error };
}
