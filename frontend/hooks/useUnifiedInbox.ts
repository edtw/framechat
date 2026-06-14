'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { extractList } from '@/lib/api-helpers';
import type {
  UnifiedConversation,
  Platform,
  DiscordConversationMeta,
  WhatsAppConversationMeta,
} from '@/types/unified';

// ==================== Normalizers ====================

function normalizeDiscordConversation(raw: Record<string, unknown>, accountId: string): UnifiedConversation {
  return {
    id: `discord_${raw.id}`,
    platform: 'discord',
    contactName: (raw.contactName as string) || null,
    contactIdentifier: (raw.contactDiscordId as string) || (raw.channelId as string) || '',
    lastMessage: (raw.lastMessage as string) || null,
    lastMessageTime: (raw.lastMessageTime as string) || null,
    unreadCount: (raw.unreadCount as number) || 0,
    isTakenOver: (raw.takeoverActive as boolean) || false,
    takenOverBy: null,
    takenOverAt: null,
    avatarUrl: (raw.avatarUrl as string) || null,
    leadScore: null,
    lifecycleStage: null,
    contactMissing: false,
    metadata: {
      accountId,
      channelId: (raw.channelId as string) || '',
      channelType: (raw.channelType as 'DM' | 'GUILD_TEXT') || 'DM',
      guildId: (raw.guildId as string) || null,
      guildName: (raw.guildName as string) || null,
      hasSignature: (raw.hasSignature as boolean) || false,
      source: (raw.source as string) || 'REACTIVE',
    } satisfies DiscordConversationMeta,
  };
}

function normalizeWhatsAppConversation(raw: Record<string, unknown>): UnifiedConversation {
  const takenOverBy = (raw.taken_over_by as string) || null;
  return {
    id: `whatsapp_${raw.id}`,
    platform: 'whatsapp',
    contactName: (raw.contactName as string) || (raw.contact_name as string) || null,
    contactIdentifier: (raw.contactNumber as string) || (raw.remoteJid as string) || '',
    lastMessage: (raw.lastMessage as string) || null,
    lastMessageTime: (raw.lastMessageTime as string) || (raw.last_message_time as string) || null,
    unreadCount: (raw.unreadCount as number) || 0,
    isTakenOver: !!takenOverBy,
    takenOverBy,
    takenOverAt: (raw.taken_over_at as string) || null,
    avatarUrl: null,
    leadScore: (raw.leadScore as number) || (raw.lead_score as number) || null,
    lifecycleStage: (raw.lifecycleStage as string) || (raw.lifecycle_stage as string) || null,
    contactMissing: (raw.contactMissing as boolean) || false,
    metadata: {
      sessionId: (raw.sessionId as string) || (raw.session_id as string) || '',
      contactNumber: (raw.contactNumber as string) || (raw.userNumber as string) || '',
      userNumber: (raw.userNumber as string) || (raw.contactNumber as string) || '',
      isBotActive: (raw.isBotActive as boolean) ?? true,
    } satisfies WhatsAppConversationMeta,
  };
}

// ==================== Hook ====================

interface UseUnifiedInboxOptions {
  platformFilter?: Platform | 'all';
}

interface UseUnifiedInboxReturn {
  conversations: UnifiedConversation[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useUnifiedInbox(
  options: UseUnifiedInboxOptions = {}
): UseUnifiedInboxReturn {
  const { platformFilter = 'all' } = options;
  const [conversations, setConversations] = useState<UnifiedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results: UnifiedConversation[] = [];
    const errors: string[] = [];

    // Fetch Discord conversations
    if (platformFilter === 'all' || platformFilter === 'discord') {
      try {
        // First get accounts
        const accountsRes = await api.get('/api/discord/accounts');
        const accounts = extractList(accountsRes.data, 'accounts');
        for (const acc of accounts) {
          const accId = (acc as Record<string, unknown>).id as string;
          if (!accId) continue;
          try {
            const convRes = await api.get('/api/discord/conversations', {
              params: { accountId: accId, limit: 100 },
            });
            const convs = extractList(convRes.data, 'conversations');
            for (const c of convs) {
              results.push(normalizeDiscordConversation(c as Record<string, unknown>, accId));
            }
          } catch {
            // Skip failed accounts
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch Discord conversations';
        errors.push(msg);
      }
    }

    // Fetch WhatsApp conversations
    if (platformFilter === 'all' || platformFilter === 'whatsapp') {
      try {
        const waRes = await api.get('/api/whatsapp/conversations', {
          params: { limit: 200 },
        });
        const waConvs = extractList(waRes.data, 'conversations');
        for (const c of waConvs) {
          const raw = c as Record<string, unknown>;
          // Skip if we already have this conversation from Discord
          const waId = `whatsapp_${raw.id}`;
          if (!results.some((r) => r.id === waId)) {
            results.push(normalizeWhatsAppConversation(raw));
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch WhatsApp conversations';
        errors.push(msg);
      }
    }

    if (!mountedRef.current) return;

    // Sort by lastMessageTime descending
    results.sort((a, b) => {
      const ta = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const tb = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return tb - ta;
    });

    setConversations(results);
    if (errors.length > 0 && results.length === 0) {
      setError(errors.join('; '));
    }
    setLoading(false);
  }, [platformFilter]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchAll]);

  return { conversations, loading, error, refresh: fetchAll };
}
