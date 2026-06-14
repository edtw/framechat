'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import ConversationsList from '@/components/inbox/ConversationsList';
import ChatWindow from '@/components/inbox/ChatWindow';
import LeadPanel from '@/components/dashboard/LeadPanel';
import { useAuthStore } from '@/stores/authStore';
import { RefreshCw, Signal } from 'lucide-react';
import { formatPhoneNumber } from '@/lib/phone';
import { useSocket } from '@/lib/useSocket';
import { useSearchParams } from 'next/navigation';

interface Message {
  id: string;
  from_number: string;
  to_number: string;
  message_text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: string;
  status?: string;
}

interface Conversation {
  id: string;
  userNumber: string;
  userName?: string;
  lastMessage: string;
  lastTimestamp: string;
  messageCount: number;
  unreadCount?: number;
  isTakenOver?: boolean;
  takenOverBy?: string;
  contactId?: number;
  leadScore?: number;
  lifecycleStage?: string;
  contactMissing?: boolean;
}

interface TakeoverStatus {
  is_taken_over: boolean;
  taken_over_by?: string;
  taken_over_at?: string;
}

interface ContactCacheEntry {
  contact?: {
    id?: number;
    name?: string;
    lead_score?: number;
    lifecycle_stage?: string;
  };
  missing: boolean;
}

function ConversationsPage() {
  const { user, token } = useAuthStore();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [takeoverStatus, setTakeoverStatus] = useState<TakeoverStatus>({ is_taken_over: false });
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showLeadPanel, setShowLeadPanel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const [contactRefreshVersion, setContactRefreshVersion] = useState(0);
  const companyRoomId = user?.companyId || user?.company_id || null;
  const contactCacheRef = useRef<Record<string, ContactCacheEntry>>({});
  const pendingTargetRef = useRef<{ phone?: string | null; conversationId?: string | null }>({});

  const socketClient = (useSocket as any)({
    token: token || undefined,
    companyId: companyRoomId ? String(companyRoomId) : undefined,
    autoConnect: Boolean(token),
  });
  const { socket, on } = socketClient;

  const loadSessions = async () => {
    try {
      setError(null);
      setSessionsLoading(true);
      const response = await api.get('/api/whatsapp/sessions');
      const available = response.data.sessions || [];
      setSessions(available);
      if (available.length === 0) {
        setError('Nenhuma sessão disponível. Conecte um dispositivo WhatsApp primeiro.');
      }

      const targetPhone = pendingTargetRef.current.phone;
      if (targetPhone && available.length > 0) {
        setSelectedSession((prev) => prev || available[0].sessionId || available[0].id || '');
      }
    } catch (err: any) {
      console.error('Falha ao carregar sessões:', err);
      setError(err.response?.data?.error || 'Erro ao carregar sessões. Tente novamente.');
    } finally {
      setSessionsLoading(false);
      setLoading(false);
    }
  };

  const loadConversations = useCallback(async (sessionId: string) => {
    try {
      setError(null);
      const response = await api.get(`/api/whatsapp/messages/${sessionId}/history?limit=1000`);
      const messagesByUser: Record<string, Message[]> = {};
      response.data.messages?.forEach((msg: Message) => {
        const userKey = msg.direction === 'incoming' ? msg.from_number : msg.to_number;
        if (!messagesByUser[userKey]) {
          messagesByUser[userKey] = [];
        }
        messagesByUser[userKey].push(msg);
      });

      const convs: Conversation[] = await Promise.all(
        Object.entries(messagesByUser).map(async ([userNumber, msgs]) => {
          const lastMsg = msgs[0];
          let takeoverInfo: TakeoverStatus = { is_taken_over: false };
          try {
            const takeoverRes = await api.get(
              `/api/whatsapp/conversations/takeover-status/${sessionId}/${userNumber}`
            );
            takeoverInfo = takeoverRes.data;
          } catch (err) {
            // ignore
          }

          let crmInfo = {
            userName: undefined as string | undefined,
            contactId: undefined as number | undefined,
            leadScore: undefined as number | undefined,
            lifecycleStage: undefined as string | undefined,
            contactMissing: false,
          };

          const cachedContact = contactCacheRef.current[userNumber];

          const applyCachedContact = (entry: ContactCacheEntry | undefined) => {
            if (!entry) return false;
            if (entry.contact) {
              crmInfo = {
                userName: entry.contact.name,
                contactId: entry.contact.id,
                leadScore: entry.contact.lead_score,
                lifecycleStage: entry.contact.lifecycle_stage,
                contactMissing: false,
              };
              return true;
            }
            if (entry.missing) {
              crmInfo = {
                userName: formatPhoneNumber(userNumber),
                contactId: undefined,
                leadScore: undefined,
                lifecycleStage: undefined,
                contactMissing: true,
              };
              return true;
            }
            return false;
          };

          let hasContactInfo = applyCachedContact(cachedContact);

          if (!hasContactInfo) {
            try {
              const contactRes = await api.get(`/api/crm/contacts/${userNumber}`);
              if (contactRes.data.contact) {
                crmInfo = {
                  userName: contactRes.data.contact.name,
                  contactId: contactRes.data.contact.id,
                  leadScore: contactRes.data.contact.lead_score,
                  lifecycleStage: contactRes.data.contact.lifecycle_stage,
                  contactMissing: false,
                };
                contactCacheRef.current[userNumber] = {
                  contact: {
                    id: contactRes.data.contact.id,
                    name: contactRes.data.contact.name,
                    lead_score: contactRes.data.contact.lead_score,
                    lifecycle_stage: contactRes.data.contact.lifecycle_stage,
                  },
                  missing: false,
                };
                hasContactInfo = true;
              }
            } catch (err: any) {
              if (err.response?.status === 404) {
                crmInfo.userName = formatPhoneNumber(userNumber);
                crmInfo.contactMissing = true;
                contactCacheRef.current[userNumber] = {
                  missing: true,
                };
              } else {
                console.warn('CRM contact fetch failed:', err.message);
              }
            }
          }

          const fallbackName = crmInfo.userName || formatPhoneNumber(userNumber);

          return {
            id: userNumber,
            userNumber,
            userName: fallbackName,
            lastMessage: lastMsg.message_text,
            lastTimestamp: lastMsg.timestamp,
            messageCount: msgs.length,
            isTakenOver: takeoverInfo.is_taken_over,
            takenOverBy: takeoverInfo.taken_over_by === user?.username ? 'Você' : takeoverInfo.taken_over_by,
            contactId: crmInfo.contactId,
            leadScore: crmInfo.leadScore,
            lifecycleStage: crmInfo.lifecycleStage,
            contactMissing: crmInfo.contactMissing,
          };
        })
      );

      convs.sort(
        (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
      );
      setConversations(convs);

      const targetPhone = pendingTargetRef.current.phone;
      const targetConversationId = pendingTargetRef.current.conversationId;

      if (targetConversationId) {
        const matchById = convs.find((c) => c.id === targetConversationId);
        if (matchById) {
          setSelectedConversation(matchById);
          pendingTargetRef.current = {};
          return;
        }
      }

      if (targetPhone) {
        const normalizedTarget = targetPhone.replace(/\D/g, '');
        const match = convs.find(
          (c) =>
            c.userNumber?.replace(/\D/g, '') === normalizedTarget ||
            formatPhoneNumber(c.userNumber || '').replace(/\D/g, '') === normalizedTarget
        );
        if (match) {
          setSelectedConversation(match);
        }
        pendingTargetRef.current = {};
      }
    } catch (err) {
      console.error('Falha ao carregar conversas:', err);
    }
  }, [user?.username]);

  const handleContactUpdated = useCallback(
    (payload: { contact?: { phone?: string; name?: string; id?: number; lead_score?: number; lifecycle_stage?: string } }) => {
      const updatedContact = payload?.contact;
      if (!updatedContact?.phone) return;
      const phone = updatedContact.phone;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.userNumber === phone
            ? {
                ...conv,
                userName: updatedContact.name || conv.userName || formatPhoneNumber(phone),
                contactId: updatedContact.id ?? conv.contactId,
                leadScore: updatedContact.lead_score ?? conv.leadScore,
                lifecycleStage: updatedContact.lifecycle_stage ?? conv.lifecycleStage,
                contactMissing: false,
              }
            : conv
        )
      );

      setSelectedConversation((prev) => {
        if (!prev || prev.userNumber !== phone) {
          return prev;
        }
        return {
          ...prev,
          userName: updatedContact.name || prev.userName || formatPhoneNumber(phone),
          contactId: updatedContact.id ?? prev.contactId,
          leadScore: updatedContact.lead_score ?? prev.leadScore,
          lifecycleStage: updatedContact.lifecycle_stage ?? prev.lifecycleStage,
          contactMissing: false,
        };
      });

      if (selectedConversation?.userNumber === phone) {
        setContactRefreshVersion((prev) => prev + 1);
      }

      contactCacheRef.current[phone] = {
        missing: false,
        contact: {
          id: updatedContact.id,
          name: updatedContact.name,
          lead_score: updatedContact.lead_score,
          lifecycle_stage: updatedContact.lifecycle_stage,
        },
      };
    },
    [selectedConversation]
  );

  const loadMessages = useCallback(async (sessionId: string, userNumber: string) => {
    try {
      const response = await api.get(`/api/whatsapp/messages/${sessionId}/history?limit=100`);
      const userMessages: Message[] =
        response.data.messages?.filter((msg: Message) => {
          const msgUser = msg.direction === 'incoming' ? msg.from_number : msg.to_number;
          return msgUser === userNumber;
        }) || [];

      userMessages.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      if (userMessages.length > lastMessageCount && lastMessageCount > 0) {
        console.log('Nova mensagem recebida!');
      }
      setLastMessageCount(userMessages.length);
      setMessages(userMessages);
    } catch (err) {
      console.error('Falha ao carregar mensagens:', err);
    }
  }, [lastMessageCount]);

  const loadTakeoverStatus = useCallback(async (sessionId: string, userNumber: string) => {
    try {
      const response = await api.get(
        `/api/whatsapp/conversations/takeover-status/${sessionId}/${userNumber}`
      );
      setTakeoverStatus({
        is_taken_over: response.data.is_taken_over,
        taken_over_by: response.data.taken_over_by === user?.username ? 'Você' : response.data.taken_over_by,
        taken_over_at: response.data.taken_over_at,
      });
    } catch (err) {
      console.error('Falha ao carregar status de takeover:', err);
      setTakeoverStatus({ is_taken_over: false });
    }
  }, [user?.username]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('whatsapp:target');
      if (stored) {
        const parsed = JSON.parse(stored);
        pendingTargetRef.current = {
          phone: parsed?.phone || null,
          conversationId: parsed?.conversationId || null,
        };
        sessionStorage.removeItem('whatsapp:target');
      }
    } catch {
      // ignore
    }

    const cid = searchParams?.get('cid');
    if (cid) {
      pendingTargetRef.current = {
        ...pendingTargetRef.current,
        conversationId: cid,
      };
    }

    loadSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token || !socket) return;
    const unsubscribe = on('crm.contact.updated', handleContactUpdated);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [token, socket, on, handleContactUpdated]);

  useEffect(() => {
    if (selectedSession) {
      loadConversations(selectedSession);
      const interval = setInterval(() => {
        loadConversations(selectedSession);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [selectedSession, loadConversations]);

  useEffect(() => {
    if (selectedConversation && selectedSession) {
      loadMessages(selectedSession, selectedConversation.userNumber);
      loadTakeoverStatus(selectedSession, selectedConversation.userNumber);
      const interval = setInterval(() => {
        loadMessages(selectedSession, selectedConversation.userNumber);
        loadTakeoverStatus(selectedSession, selectedConversation.userNumber);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedConversation, selectedSession, loadMessages, loadTakeoverStatus]);

  const handleTakeOver = async () => {
    if (!selectedConversation || !selectedSession) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.post('/api/whatsapp/conversations/takeover', {
        sessionId: selectedSession,
        userPhone: selectedConversation.userNumber,
      });
      await loadTakeoverStatus(selectedSession, selectedConversation.userNumber);
      await loadConversations(selectedSession);
    } catch (err: any) {
      console.error('Falha ao assumir conversa:', err);
      const errorMsg = err.response?.data?.error || 'Erro ao assumir conversa';
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnToAI = async () => {
    if (!selectedConversation || !selectedSession) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.post('/api/whatsapp/conversations/return-to-ai', {
        sessionId: selectedSession,
        userPhone: selectedConversation.userNumber,
        notes: 'Devolvido via painel',
      });
      await loadTakeoverStatus(selectedSession, selectedConversation.userNumber);
      await loadConversations(selectedSession);
    } catch (err: any) {
      console.error('Falha ao devolver conversa:', err);
      const errorMsg = err.response?.data?.error || 'Erro ao devolver conversa';
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!selectedConversation || !selectedSession) return;
    setError(null);
    try {
      await api.post('/api/whatsapp/conversations/send-message', {
        sessionId: selectedSession,
        userPhone: selectedConversation.userNumber,
        message,
        type: 'text',
      });
      await loadMessages(selectedSession, selectedConversation.userNumber);
    } catch (err: any) {
      console.error('Falha ao enviar mensagem:', err);
      const errorMsg = err.response?.data?.error || 'Erro ao enviar mensagem';
      setError(errorMsg);
      alert(errorMsg);
      throw err;
    }
  };

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const handleFilter = useCallback(() => {
    console.log('Filter clicked');
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setSelectedConversation(conv);
    }
  }, [conversations]);

  const filteredConversations = conversations.filter((conv) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      conv.userNumber.includes(term) ||
      conv.userName?.toLowerCase().includes(term) ||
      conv.lastMessage.toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Carregando conversas...</p>
        </div>
      </div>
    );
  }

  if (!selectedSession) {
    return (
      <div className="space-y-8">
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-[36px] border border-white/5 bg-gradient-to-br from-[#121730] via-[#0a0f21] to-[#060710] px-6 py-8 sm:px-8"
        >
          <div className="pointer-events-none absolute inset-0 opacity-35">
            <div className="absolute -left-12 top-0 h-56 w-56 rounded-full bg-indigo-500/25 blur-[120px]" />
            <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-purple-500/20 blur-[130px]" />
          </div>
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-5 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-white/60">
                <Signal className="h-3.5 w-3.5" />
                Conversas
              </div>
              <div>
                <h1 className="text-3xl font-light text-white">Selecione uma sessão para continuar</h1>
                <p className="mt-3 text-sm text-white/70">
                  Cada sessão representa um dispositivo conectado ao WhatsApp. Monitore o status e entre no painel de conversas.
                </p>
              </div>
            </div>
            <button
              onClick={loadSessions}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm text-white/80 hover:border-white/60"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </motion.section>

        {error && (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="rounded-[32px] border border-white/5 bg-white/[0.02] p-6 sm:p-8">
          {sessionsLoading ? (
            <div className="flex min-h-[200px] items-center justify-center text-white/70">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-white/40 border-t-transparent rounded-full animate-spin" />
                <p>Carregando sessões...</p>
              </div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-white/70 py-16">
              <p className="text-lg font-light text-white">Nenhuma sessão disponível</p>
              <p className="text-sm text-white/60">Conecte um dispositivo WhatsApp para começar.</p>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
              className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
            >
              {sessions.map((session) => (
                <motion.button
                  key={session.sessionId}
                  variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
                  onClick={() => setSelectedSession(session.sessionId)}
                  className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 text-left transition hover:border-white/40"
                >
                  <div className="flex items-center justify_between">
                    <span className="text-sm text-white/60">
                      {session.sessionName || session.sessionId}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs ${
                        session.status === 'connected'
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : session.status === 'disconnected'
                          ? 'bg-rose-500/15 text-rose-200'
                          : 'bg-amber-500/15 text-amber-100'
                      }`}
                    >
                      {session.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-white/60">
                    Mensagens: <span className="text-white">{session.messageCount || 0}</span>
                  </p>
                  {session.lastActive && (
                    <p className="text-xs text-white/50">
                      Última atividade {new Date(session.lastActive).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  <div className="mt-4 text-right text-sm text-white/80">Entrar →</div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </section>
      </div>
    );
  }

  // Visualização da sessão selecionada
  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-[24px] border border-white/5 bg-white/[0.02] backdrop-blur-xl px-5 py-4"
      >
        <div className="flex items-center gap-2 text-sm text-white/70">
          <button
            onClick={() => {
              setSelectedSession('');
              setSelectedConversation(null);
              setMessages([]);
              setConversations([]);
            }}
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white transition-all duration-200 hover:-translate-x-0.5"
          >
            <span>←</span>
            <span className="hidden sm:inline">Voltar para Sessões</span>
            <span className="sm:hidden">Voltar</span>
          </button>
          <span className="text-white/40">/</span>
          <span className="text-white font-medium truncate max-w-xs">
            {sessions.find((s) => s.sessionId === selectedSession)?.sessionName || selectedSession}
          </span>
        </div>
      </motion.section>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 flex items-center justify-between gap-4"
        >
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="flex-shrink-0 text-rose-200 hover:text-white transition-colors px-2 py-1 hover:bg-rose-500/20 rounded-lg"
          >
            Fechar
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-[70vh] xl:h-[calc(100vh-240px)]">
        <div
          className={`${
            selectedConversation ? 'hidden xl:block' : 'block'
          } xl:col-span-4 rounded-[24px] border border-white/5 bg-white/[0.02] overflow-hidden shadow-2xl shadow-black/20 flex flex-col min-h-0`}
        >
          <ConversationsList
            conversations={filteredConversations}
            selectedConversation={selectedConversation?.id || null}
            onSelectConversation={handleSelectConversation}
            onSearch={handleSearch}
            onFilter={handleFilter}
          />
        </div>

        <div
          className={`${
            !selectedConversation ? 'hidden xl:block' : 'block'
          } xl:col-span-8 rounded-[24px] border border-white/5 bg-white/[0.02] overflow-hidden shadow-2xl shadow-black/20 flex flex-col min-h-0`}
        >
          {selectedConversation && (
            <div className="xl:hidden border-b border-white/5 bg-white/[0.02] backdrop-blur-xl px-4 py-3">
              <button
                onClick={() => setSelectedConversation(null)}
                className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-all duration-200"
              >
                <span>←</span>
                <span>Voltar para conversas</span>
              </button>
            </div>
          )}

          <div className="flex-1 flex flex-col xl:flex-row gap-4 h-full min-h-0">
            <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white/[0.01] rounded-[20px] border border-white/5">
              <ChatWindow
                conversation={
                  selectedConversation
                    ? {
                        userNumber: selectedConversation.userNumber,
                        userName: selectedConversation.userName,
                        isOnline: false,
                      }
                    : null
                }
                messages={messages}
                isTakenOver={takeoverStatus.is_taken_over}
                takenOverBy={takeoverStatus.taken_over_by}
                onTakeOver={handleTakeOver}
                onReturnToAI={handleReturnToAI}
                onSendMessage={handleSendMessage}
                loading={actionLoading}
                onShowLeadPanel={() => setShowLeadPanel(true)}
              />
            </div>

            {showLeadPanel && selectedConversation && selectedSession && (
              <div className="xl:w-[420px] flex-shrink-0 rounded-[28px] border border-white/8 bg-white/[0.08] backdrop-blur-xl shadow-2xl shadow-black/25 min-h-0 overflow-hidden">
            <LeadPanel
              phoneNumber={selectedConversation.userNumber}
              companyId={selectedSession}
              messages={messages}
              takeoverStatus={takeoverStatus}
              onClose={() => setShowLeadPanel(false)}
              onReturnToAI={handleReturnToAI}
              refreshKey={contactRefreshVersion}
              onContactUpdated={(contact) => handleContactUpdated({ contact })}
            />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConversationsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-[#0A0A0F]"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <ConversationsPage />
    </Suspense>
  );
}
