'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { extractList } from '@/lib/api-helpers';
import { useUnifiedInbox } from '@/hooks/useUnifiedInbox';
import { useUnifiedChat } from '@/hooks/useUnifiedChat';
import { useUnifiedTakeover } from '@/hooks/useUnifiedTakeover';
import { useUnifiedSend } from '@/hooks/useUnifiedSend';
import UnifiedConversationsList from '@/components/inbox/UnifiedConversationsList';
import UnifiedChatWindow from '@/components/inbox/UnifiedChatWindow';
import DetailPanel from '@/components/inbox/DetailPanel';
import type { UnifiedConversation, Platform } from '@/types/unified';
import type { WritingSignature, SelfSignature, Persona } from '@/types/discord';
import { RefreshCw } from 'lucide-react';

// ==================== Polling Intervals ====================
const CONVERSATIONS_POLL_MS = 10000; // 10s
const MESSAGES_POLL_MS = 5000; // 5s

export default function InboxPage() {
  // Platform filter
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');

  // Inbox data
  const { conversations, loading, error, refresh } = useUnifiedInbox({ platformFilter });

  // Selection
  const [selectedConv, setSelectedConv] = useState<UnifiedConversation | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.contactName || '').toLowerCase().includes(q) ||
        c.contactIdentifier.toLowerCase().includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  // Get native conversation ID
  const nativeConvId = selectedConv?.id?.replace(/^(whatsapp_|discord_)/, '') || '';

  // Chat
  const {
    messages,
    loading: messagesLoading,
    loadingMore,
    hasMore,
    loadMore,
    refresh: refreshMessages,
  } = useUnifiedChat(
    selectedConv
      ? {
          platform: selectedConv.platform,
          conversationId: nativeConvId,
          metadata: selectedConv.metadata,
        }
      : null
  );

  // Takeover
  const {
    isTakenOver,
    takenOverBy,
    loading: takeoverLoading,
    toggleTakeover,
  } = useUnifiedTakeover({
    platform: selectedConv?.platform || 'whatsapp',
    conversationId: nativeConvId,
    metadata: selectedConv?.metadata,
    initialTakenOver: selectedConv?.isTakenOver || false,
    initialTakenOverBy: selectedConv?.takenOverBy || null,
  });

  // Send
  const { sendMessage, sending } = useUnifiedSend({
    platform: selectedConv?.platform || 'whatsapp',
    conversationId: nativeConvId,
    metadata: selectedConv?.metadata,
  });

  // Detail panel
  const [detailOpen, setDetailOpen] = useState(false);

  // Signature data
  const [partnerSignature, setPartnerSignature] = useState<WritingSignature | null>(null);
  const [selfSignature, setSelfSignature] = useState<SelfSignature | null>(null);

  // Persona data
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);

  // ==================== Polling for real-time updates ====================

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll conversations list every 10s
  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      refresh();
    }, CONVERSATIONS_POLL_MS);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [refresh]);

  // Poll messages + takeover every 5s when a conversation is selected
  useEffect(() => {
    if (selectedConv && !isTakenOver) {
      msgPollRef.current = setInterval(() => {
        refreshMessages();
      }, MESSAGES_POLL_MS);
    }
    return () => {
      if (msgPollRef.current) clearInterval(msgPollRef.current);
    };
  }, [selectedConv, isTakenOver, refreshMessages]);

  // ==================== Fetch signatures for selected conversation ====================

  useEffect(() => {
    if (!selectedConv) {
      setPartnerSignature(null);
      setSelfSignature(null);
      setActivePersona(null);
      return;
    }

    // Fetch partner signature (Discord only for now)
    if (selectedConv.platform === 'discord' && nativeConvId) {
      api
        .get(`/api/discord/conversations/${nativeConvId}/signature`)
        .then((res) => {
          const sig = (res.data as any)?.conversation?.writingSignature || null;
          setPartnerSignature(sig);
        })
        .catch(() => setPartnerSignature(null));

      // Fetch self signature
      const meta = selectedConv.metadata as any;
      const accountId = meta?.accountId;
      if (accountId) {
        api
          .get(`/api/discord/accounts/${accountId}/self-signature`)
          .then((res) => {
            const sig = (res.data as any)?.signature || null;
            setSelfSignature(sig);
          })
          .catch(() => setSelfSignature(null));

        // Fetch personas
        api
          .get('/api/discord/personas')
          .then((res) => {
            const list = extractList(res.data, 'personas') as Persona[];
            setPersonas(list);
          })
          .catch(() => setPersonas([]));

        // Fetch active persona
        api
          .get(`/api/discord/accounts/${accountId}/active-persona`)
          .then((res) => {
            const p = (res.data as any)?.persona || null;
            setActivePersona(p);
          })
          .catch(() => setActivePersona(null));
      }
    }
  }, [selectedConv, nativeConvId]);

  // ==================== Handlers ====================

  const handleSelectConversation = useCallback((conv: UnifiedConversation) => {
    setSelectedConv(conv);
    setDetailOpen(false);
  }, []);

  const handleTakeOver = useCallback(async () => {
    await toggleTakeover(true);
    setSelectedConv((prev) => (prev ? { ...prev, isTakenOver: true, takenOverBy: 'Você' } : prev));
  }, [toggleTakeover]);

  const handleReturnToAI = useCallback(async () => {
    await toggleTakeover(false);
    setSelectedConv((prev) => (prev ? { ...prev, isTakenOver: false, takenOverBy: null } : prev));
  }, [toggleTakeover]);

  const handleSendMessage = useCallback(
    async (body: string) => {
      await sendMessage(body);
      setTimeout(() => refreshMessages(), 500);
    },
    [sendMessage, refreshMessages]
  );

  const handleAnalyzeSignature = useCallback(async () => {
    if (!selectedConv || selectedConv.platform !== 'discord' || !nativeConvId) return;
    try {
      await api.post(`/api/discord/conversations/${nativeConvId}/analyze`);
      // Refetch signature after a short delay
      setTimeout(() => {
        api
          .get(`/api/discord/conversations/${nativeConvId}/signature`)
          .then((res) => {
            const sig = (res.data as any)?.conversation?.writingSignature || null;
            setPartnerSignature(sig);
          })
          .catch(() => {});
      }, 2000);
    } catch {
      // Analysis may not be available
    }
  }, [selectedConv, nativeConvId]);

  // Listen for escape to close detail panel
  useEffect(() => {
    const handler = () => setDetailOpen(false);
    window.addEventListener('app:escape', handler);
    return () => window.removeEventListener('app:escape', handler);
  }, []);

  // ==================== Render ====================

  return (
    <div className="flex h-full">
      {/* Left: Conversation list */}
      <div className="w-[320px] shrink-0 h-full">
        {/* Refresh button */}
        <div className="absolute top-2 right-2 z-10 md:hidden">
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg bg-white/[0.04] text-white/30 hover:text-white/60"
            title="Atualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <UnifiedConversationsList
          conversations={filteredConversations}
          selectedId={selectedConv?.id || null}
          onSelect={handleSelectConversation}
          onSearch={setSearchQuery}
          platformFilter={platformFilter}
          onPlatformFilterChange={setPlatformFilter}
          loading={loading}
        />
      </div>

      {/* Center: Chat window */}
      <UnifiedChatWindow
        conversation={selectedConv}
        messages={messages}
        loading={messagesLoading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
        isTakenOver={isTakenOver}
        takenOverBy={takenOverBy}
        takeoverLoading={takeoverLoading}
        onTakeOver={handleTakeOver}
        onReturnToAI={handleReturnToAI}
        onSendMessage={handleSendMessage}
        sending={sending}
        detailOpen={detailOpen}
        onToggleDetail={() => setDetailOpen((o) => !o)}
      />

      {/* Right: Detail panel */}
      <DetailPanel
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        conversation={selectedConv}
        partnerSignature={partnerSignature}
        selfSignature={selfSignature}
        onAnalyzeSignature={handleAnalyzeSignature}
        personas={personas}
        activePersona={activePersona}
        onSetActivePersona={async (personaId) => {
          if (!selectedConv || selectedConv.platform !== 'discord') return;
          const meta = selectedConv.metadata as any;
          const accountId = meta?.accountId;
          if (!accountId) return;
          try {
            await api.post(`/api/discord/accounts/${accountId}/active-persona`, { personaId });
            setActivePersona(personas.find((p) => p.id === personaId) || null);
          } catch {
            // Silently fail
          }
        }}
      />
    </div>
  );
}
