'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { extractList } from '@/lib/api-helpers';
import type {
  UnifiedMessage,
  Platform,
  DiscordConversationMeta,
  WhatsAppConversationMeta,
} from '@/types/unified';

// ==================== Normalizers ====================

function normalizeDiscordMessage(raw: Record<string, unknown>): UnifiedMessage {
  const fromMe = (raw.fromMe as boolean) || false;
  return {
    id: raw.id as string,
    platform: 'discord' as Platform,
    fromMe,
    body: (raw.body as string) || null,
    timestamp: (raw.timestamp as string) || new Date().toISOString(),
    aiProcessed: (raw.aiProcessed as boolean) || false,
    messageType: (raw.messageType as string) || 'TEXT',
    direction: fromMe ? 'outgoing' : 'incoming',
    status: null,
  };
}

function normalizeWhatsAppMessage(raw: Record<string, unknown>): UnifiedMessage {
  const fromMe = (raw.fromMe as boolean) || (raw.direction as string) === 'outgoing';
  return {
    id: raw.id as string,
    platform: 'whatsapp' as Platform,
    fromMe,
    body: (raw.body as string) || (raw.message_text as string) || null,
    timestamp: (raw.timestamp as string) || new Date().toISOString(),
    aiProcessed: (raw.aiProcessed as boolean) || false,
    messageType: (raw.messageType as string) || 'TEXT',
    direction: fromMe ? 'outgoing' : 'incoming',
    status: (raw.status as string) || null,
  };
}

// ==================== Hook ====================

interface UseUnifiedChatOptions {
  platform: Platform;
  conversationId: string; // The platform-native conversation ID (not the unified prefixed one)
  metadata?: DiscordConversationMeta | WhatsAppConversationMeta | null;
}

interface UseUnifiedChatReturn {
  messages: UnifiedMessage[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: string | null;
  refresh: () => void;
}

export function useUnifiedChat(options: UseUnifiedChatOptions | null): UseUnifiedChatReturn {
  const { platform, conversationId, metadata } = options || {};
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const oldestRef = useRef<string | null>(null);

  const fetchMessages = useCallback(
    async (loadMoreFlag = false) => {
      if (!platform || !conversationId) return;
      if (loadMoreFlag) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        if (platform === 'discord') {
          const params: Record<string, unknown> = { limit: 50 };
          if (loadMoreFlag && oldestRef.current) {
            params.before = oldestRef.current;
          }
          const res = await api.get(`/api/discord/conversations/${conversationId}/messages`, { params });
          const raw = extractList(res.data, 'messages');
          const normalized = raw.map((m) => normalizeDiscordMessage(m as Record<string, unknown>));
          // Discord returns newest first; reverse for chat display (oldest at top)
          normalized.reverse();

          if (!mountedRef.current) return;
          setHasMore((res.data as Record<string, unknown>)?.hasMore as boolean || normalized.length >= 50);
          setMessages((prev) =>
            loadMoreFlag ? [...normalized, ...prev] : normalized
          );
          if (normalized.length > 0) {
            oldestRef.current = normalized[0].id;
          }
        } else {
          // WhatsApp: offset-based pagination
          const params: Record<string, unknown> = { conversationId, limit: 50 };
          if (loadMoreFlag) {
            params.offset = messages.length;
          }
          const res = await api.get('/api/whatsapp/messages', { params });
          const raw = extractList(res.data, 'messages');
          const normalized = raw.map((m) => normalizeWhatsAppMessage(m as Record<string, unknown>));

          if (!mountedRef.current) return;
          const total = (res.data as Record<string, unknown>)?.total as number;
          setHasMore(loadMoreFlag ? normalized.length + messages.length < (total || 0) : normalized.length >= 50);
          setMessages((prev) =>
            loadMoreFlag ? [...normalized, ...prev] : normalized
          );
        }
      } catch (e: unknown) {
        if (!mountedRef.current) return;
        const msg = e instanceof Error ? e.message : 'Failed to fetch messages';
        setError(msg);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [platform, conversationId, messages.length]
  );

  useEffect(() => {
    mountedRef.current = true;
    oldestRef.current = null;
    setMessages([]);
    setHasMore(true);
    fetchMessages(false);
    return () => {
      mountedRef.current = false;
    };
  }, [platform, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchMessages(true);
    }
  }, [fetchMessages, loadingMore, hasMore]);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    refresh: () => fetchMessages(false),
  };
}
