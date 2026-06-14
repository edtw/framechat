'use client';

import { useState, useCallback } from 'react';
import api from '@/lib/api';
import type { Platform, DiscordConversationMeta, WhatsAppConversationMeta } from '@/types/unified';

interface UseUnifiedTakeoverOptions {
  platform: Platform;
  /** The native platform conversation ID (no prefix). */
  conversationId: string;
  metadata?: DiscordConversationMeta | WhatsAppConversationMeta | null;
  /** Current takeover state from the conversation object. */
  initialTakenOver?: boolean;
  initialTakenOverBy?: string | null;
}

interface UseUnifiedTakeoverReturn {
  isTakenOver: boolean;
  takenOverBy: string | null;
  loading: boolean;
  toggleTakeover: (enable: boolean) => Promise<void>;
}

export function useUnifiedTakeover(options: UseUnifiedTakeoverOptions): UseUnifiedTakeoverReturn {
  const { platform, conversationId, metadata, initialTakenOver = false, initialTakenOverBy = null } = options;
  const [isTakenOver, setIsTakenOver] = useState(initialTakenOver);
  const [takenOverBy, setTakenOverBy] = useState<string | null>(initialTakenOverBy);
  const [loading, setLoading] = useState(false);

  const toggleTakeover = useCallback(
    async (enable: boolean) => {
      setLoading(true);
      try {
        if (platform === 'discord') {
          await api.post(`/api/discord/conversations/${conversationId}/takeover`, {
            active: enable,
          });
          setIsTakenOver(enable);
          setTakenOverBy(enable ? 'Você' : null);
        } else {
          // WhatsApp uses separate endpoints
          const meta = metadata as WhatsAppConversationMeta | undefined;
          if (!meta?.sessionId || !meta?.contactNumber) {
            throw new Error('Missing WhatsApp session/contact info for takeover');
          }
          if (enable) {
            await api.post('/api/whatsapp/conversations/takeover', {
              sessionId: meta.sessionId,
              userPhone: meta.contactNumber,
            });
          } else {
            await api.post('/api/whatsapp/conversations/return-to-ai', {
              sessionId: meta.sessionId,
              userPhone: meta.contactNumber,
            });
          }
          setIsTakenOver(enable);
          setTakenOverBy(enable ? 'Você' : null);
        }
      } finally {
        setLoading(false);
      }
    },
    [platform, conversationId, metadata]
  );

  return { isTakenOver, takenOverBy, loading, toggleTakeover };
}
