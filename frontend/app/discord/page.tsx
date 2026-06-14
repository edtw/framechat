'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { extractList, extractItem } from '@/lib/api-helpers';
import { cn } from '@/lib/utils';
import DiscordToggle from '@/components/discord/DiscordToggle';
import type { DiscordAccount, DiscordConfig, Persona, SelfSignature } from '@/types/discord';
import {
  Hash,
  Plus,
  Plug,
  PowerOff,
  Trash2,
  Loader2,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  Inbox,
  Search,
  ChevronDown,
  User,
  RefreshCw,
  MessageCircle,
  HashIcon,
  FileText,
  Clock,
  Users,
  Edit3,
  Check,
  X,
  Shapes,
  Brain,
  VenetianMask,
  CheckCircle2,
  Activity,
  Wifi,
  WifiOff,
  Send,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscordConversation {
  id: string;
  channelId: string;
  channelType: 'DM' | 'GUILD_TEXT';
  guildId: string | null;
  guildName: string | null;
  contactName: string | null;
  contactDiscordId: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  messageCount: number;
  hasSignature: boolean;
  takeoverActive: boolean;
  source: string;
  unreadCount?: number;
  avatarUrl?: string | null;
}

interface DiscordMessage {
  id: string;
  fromMe: boolean;
  body: string | null;
  messageType: string;
  timestamp: string;
  aiProcessed: boolean;
}

interface ConversationSignature {
  id: string;
  contactName: string | null;
  writingSignature: Record<string, unknown> | null;
  signatureUpdatedAt: string | null;
  hasSignature: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status?: string) {
  const s = (status || '').toUpperCase();
  if (s === 'CONNECTED') return '#23a55a';
  if (s === 'CONNECTING') return '#f0b232';
  if (s === 'ERROR') return '#f23f43';
  return '#80848e';
}

function statusLabel(status?: string) {
  const s = (status || '').toUpperCase();
  if (s === 'CONNECTED') return 'Conectado';
  if (s === 'CONNECTING') return 'Conectando…';
  if (s === 'ERROR') return 'Erro';
  return 'Desconectado';
}

function formatDiscordTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatFullTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function avatarInitial(name: string | null | undefined): string {
  return (name || '?').charAt(0).toUpperCase();
}

function avatarColor(name: string | null | undefined): string {
  const colors = [
    '#5865F2', '#57F287', '#FEE75C', '#EB459E',
    '#ED4245', '#F0B232', '#23A55A', '#80848E',
  ];
  let hash = 0;
  const str = name || '?';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Group conversations: DMs first (CONVERSAS), then guild channels grouped by guildId (SERVIDORES). */
function groupConversations(convs: DiscordConversation[]) {
  const dms = convs.filter((c) => c.channelType === 'DM');
  const guildChannels = convs.filter((c) => c.channelType === 'GUILD_TEXT');

  // Group guild channels by guildId
  const guildMap = new Map<string, DiscordConversation[]>();
  for (const ch of guildChannels) {
    const key = ch.guildId || '__noguild__';
    if (!guildMap.has(key)) guildMap.set(key, []);
    guildMap.get(key)!.push(ch);
  }

  const guilds = Array.from(guildMap.entries()).map(([guildId, channels]) => ({
    guildId: guildId === '__noguild__' ? null : guildId,
    guildName: channels[0]?.guildName || 'Servidor',
    channels,
  }));

  return { dms, guilds };
}

/** Parse signature JSON into flat key-value traits for display. */
function parseSignatureTraits(sig: Record<string, unknown> | null): { key: string; value: string }[] {
  if (!sig) return [];
  const traits: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(sig)) {
    if (typeof v === 'string' && v.length < 200) {
      traits.push({ key: k, value: v });
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      // Flatten nested object
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof nv === 'string' && nv.length < 200) {
          traits.push({ key: `${k}.${nk}`, value: nv });
        }
      }
    }
  }
  return traits;
}

/** Map English signature trait keys to Portuguese labels. */
const SIGNATURE_LABELS_PT: Record<string, string> = {
  avgMessageLength: 'Tamanho médio das mensagens',
  medianMessageLength: 'Tamanho mediano das mensagens',
  avgWordsPerMessage: 'Média de palavras por mensagem',
  emojiFrequency: 'Frequência de emojis',
  topEmojis: 'Emojis mais usados',
  punctuationStyle: 'Estilo de pontuação',
  capitalization: 'Capitalização',
  questionFrequency: 'Frequência de perguntas',
  exclamationFrequency: 'Frequência de exclamações',
  commonWords: 'Palavras comuns',
  formalityScore: 'Nível de formalidade',
  abbreviationRate: 'Taxa de abreviações',
  messageCount: 'Total de mensagens analisadas',
  analyzedAt: 'Analisado em',
};

/** Format a signature trait value for display. */
function formatTraitValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'number') {
    // Percentages / ratios
    if (key === 'formalityScore' || key === 'abbreviationRate') {
      return `${Math.round(value * 100)}%`;
    }
    if (key === 'emojiFrequency' || key === 'questionFrequency' || key === 'exclamationFrequency') {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (key === 'avgMessageLength' || key === 'medianMessageLength') {
      return `${Math.round(value)} caracteres`;
    }
    if (key === 'avgWordsPerMessage') {
      return `${value.toFixed(1)} palavras`;
    }
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DiscordPage() {
  const router = useRouter();

  // --- Accounts ---
  const [accounts, setAccounts] = useState<DiscordAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // --- Add account ---
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newToken, setNewToken] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // --- Account actions ---
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // --- Conversations ---
  const [conversations, setConversations] = useState<DiscordConversation[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [convsError, setConvsError] = useState<string | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  // --- Messages ---
  const [messages, setMessages] = useState<DiscordMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [msgsError, setMsgsError] = useState<string | null>(null);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const composeInputRef = useRef<HTMLTextAreaElement>(null);

  // --- Takeover ---
  const [takeoverLoading, setTakeoverLoading] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [sending, setSending] = useState(false);

  // --- Config ---
  const [config, setConfig] = useState<DiscordConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // --- Signature ---
  const [signature, setSignature] = useState<ConversationSignature | null>(null);
  const [sigLoading, setSigLoading] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // --- Self-signature ---
  const [selfSignature, setSelfSignature] = useState<SelfSignature | null>(null);
  const [selfSigLoading, setSelfSigLoading] = useState(false);
  const [selfSigError, setSelfSigError] = useState<string | null>(null);
  const [analyzingSelf, setAnalyzingSelf] = useState(false);

  // --- Personas ---
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personasLoading, setPersonasLoading] = useState(false);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaNotice, setPersonaNotice] = useState<string | null>(null);

  // Persona modal
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [personaForm, setPersonaForm] = useState({ name: '', description: '', systemPrompt: '' });
  const [savingPersona, setSavingPersona] = useState(false);
  const [deletingPersona, setDeletingPersona] = useState(false);

  // --- Search / filter ---
  const [searchQuery, setSearchQuery] = useState('');

  // --- Right panel tab ---
  const [rightTab, setRightTab] = useState<'conta' | 'assinatura' | 'persona'>('conta');
  const [signatureTab, setSignatureTab] = useState<'self' | 'partner'>('partner');

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId],
  );

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedConvId) || null,
    [conversations, selectedConvId],
  );

  // Filtered conversations
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.contactName || '').toLowerCase().includes(q) ||
        (c.channelId || '').toLowerCase().includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q) ||
        (c.guildName || '').toLowerCase().includes(q),
    );
  }, [conversations, searchQuery]);

  const grouped = useMemo(() => groupConversations(filteredConversations), [filteredConversations]);

  // Derived: last activity time across all conversations
  const lastActivityTime = useMemo(() => {
    if (conversations.length === 0) return null;
    const times = conversations
      .map((c) => c.lastMessageTime)
      .filter((t): t is string => !!t)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return times[0] || null;
  }, [conversations]);

  // ========================= ACCOUNTS =========================

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const { data } = await api.get('/api/discord/accounts');
      const list = extractList(data, 'accounts') as DiscordAccount[];
      setAccounts(list);
      if (!selectedAccountId) {
        setSelectedAccountId(list[0]?.id || null);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setAccountsError(msg || 'Erro ao carregar contas do Discord');
    } finally {
      setAccountsLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Real-time status polling (every 10 seconds) ---
  const [statusPolling, setStatusPolling] = useState(false);
  useEffect(() => {
    if (!selectedAccountId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/api/discord/accounts/${selectedAccountId}`);
        const updated = (extractItem(data, 'account') || data) as unknown as DiscordAccount;
        if (updated && updated.id) {
          setAccounts((prev) =>
            prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
          );
          if (updated.status !== selectedAccount?.status) {
            setStatusPolling(false);
          } else if (
            updated.status?.toUpperCase() === 'CONNECTING' ||
            updated.status?.toUpperCase() === 'ERROR'
          ) {
            setStatusPolling(true);
          } else {
            setStatusPolling(false);
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [selectedAccountId, selectedAccount?.status]);

  // ========================= CONVERSATIONS =========================

  const loadConversations = useCallback(async (accountId: string) => {
    setConvsLoading(true);
    setConvsError(null);
    setSelectedConvId(null);
    setMessages([]);
    setSignature(null);
    try {
      const { data } = await api.get('/api/discord/conversations', {
        params: { accountId, limit: 100 },
      });
      const list = (extractList(data, 'conversations') || []) as DiscordConversation[];
      setConversations(list);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setConvsError(msg || 'Erro ao carregar conversas');
    } finally {
      setConvsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadConversations(selectedAccountId);
    } else {
      setConversations([]);
      setSelectedConvId(null);
      setMessages([]);
      setSignature(null);
    }
  }, [selectedAccountId, loadConversations]);

  // ========================= CONFIG =========================

  const loadConfig = useCallback(async (accountId: string) => {
    setConfigLoading(true);
    try {
      const { data } = await api.get(`/api/discord/accounts/${accountId}/config`);
      const cfg = (extractItem(data, 'config') as DiscordConfig) || {};
      setConfig(cfg);
    } catch {
      setConfig({});
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadConfig(selectedAccountId);
    } else {
      setConfig(null);
    }
  }, [selectedAccountId, loadConfig]);

  // ========================= MESSAGES =========================

  const loadMessages = useCallback(async (convId: string, before?: string, append?: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setMsgsLoading(true);
      setMessages([]);
    }
    setMsgsError(null);
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (before) params.before = before;
      const { data } = await api.get(`/api/discord/conversations/${convId}/messages`, { params });
      const msgs = (extractList(data, 'messages') || []) as DiscordMessage[];
      const more = (data as { hasMore?: boolean }).hasMore || false;
      if (append) {
        setMessages((prev) => [...msgs, ...prev]);
      } else {
        // Messages come newest-first from API; reverse for chronological display
        setMessages(msgs.reverse());
      }
      setHasMoreMsgs(more);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setMsgsError(msg || 'Erro ao carregar mensagens');
    } finally {
      setMsgsLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
    } else {
      setMessages([]);
      setHasMoreMsgs(false);
    }
  }, [selectedConvId, loadMessages]);

  // Auto-scroll to bottom when messages load (initial load only)
  useEffect(() => {
    if (!msgsLoading && messages.length > 0 && !loadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgsLoading, messages.length, loadingMore]);

  // ========================= SIGNATURE =========================

  const loadSignature = useCallback(async (convId: string) => {
    setSigLoading(true);
    setSigError(null);
    try {
      const { data } = await api.get(`/api/discord/conversations/${convId}/signature`);
      const conv = extractItem(data, 'conversation') as unknown as ConversationSignature;
      if (conv && conv.id) {
        setSignature(conv);
      } else {
        // If response itself looks like the conversation
        const raw = data as { conversation?: ConversationSignature } & ConversationSignature;
        if (raw.conversation) {
          setSignature(raw.conversation);
        } else if (raw.id) {
          setSignature(raw);
        } else {
          setSignature(null);
        }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSigError(msg || 'Erro ao carregar assinatura');
      setSignature(null);
    } finally {
      setSigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      loadSignature(selectedConvId);
    } else {
      setSignature(null);
    }
  }, [selectedConvId, loadSignature]);

  // ========================= SELF-SIGNATURE =========================

  const loadSelfSignature = useCallback(async (accountId: string) => {
    setSelfSigLoading(true);
    setSelfSigError(null);
    try {
      const { data } = await api.get(`/api/discord/accounts/${accountId}/self-signature`);
      const ss = (extractItem(data, 'selfSignature') || data?.selfSignature || data) as SelfSignature | null;
      setSelfSignature(ss && ss.messageCount !== undefined ? ss : null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSelfSigError(msg || 'Erro ao carregar assinatura própria');
      setSelfSignature(null);
    } finally {
      setSelfSigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadSelfSignature(selectedAccountId);
    } else {
      setSelfSignature(null);
    }
  }, [selectedAccountId, loadSelfSignature]);

  const handleSelfAnalysis = async () => {
    if (!selectedAccountId) return;
    setAnalyzingSelf(true);
    setNotice(null);
    try {
      await api.post(`/api/discord/accounts/${selectedAccountId}/self-analysis`);
      setNotice('Análise da sua escrita iniciada. Atualize em alguns instantes.');
      // Reload after a short delay
      setTimeout(() => {
        if (selectedAccountId) loadSelfSignature(selectedAccountId);
      }, 3000);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setNotice('O endpoint de autoanálise não está disponível no momento.');
      } else {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setNotice(msg || 'Erro ao solicitar autoanálise');
      }
    } finally {
      setAnalyzingSelf(false);
    }
  };

  // ========================= PERSONAS =========================

  const loadPersonas = useCallback(async () => {
    setPersonasLoading(true);
    try {
      const { data } = await api.get('/api/discord/personas');
      const list = extractList(data, 'personas') as Persona[];
      setPersonas(list);
    } catch {
      // silently fail — personas are optional
    } finally {
      setPersonasLoading(false);
    }
  }, []);

  const loadActivePersona = useCallback(async (accountId: string) => {
    setPersonaLoading(true);
    try {
      const { data } = await api.get(`/api/discord/accounts/${accountId}/persona`);
      setActivePersona((data as { persona?: Persona })?.persona || null);
    } catch {
      setActivePersona(null);
    } finally {
      setPersonaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadPersonas();
      loadActivePersona(selectedAccountId);
    } else {
      setPersonas([]);
      setActivePersona(null);
    }
  }, [selectedAccountId, loadPersonas, loadActivePersona]);

  const handleSetActivePersona = async (personaId: string | null) => {
    if (!selectedAccountId) return;
    setPersonaNotice(null);
    try {
      await api.put(`/api/discord/accounts/${selectedAccountId}/persona`, { personaId });
      setPersonaNotice(personaId ? 'Persona ativada com sucesso.' : 'Persona desativada.');
      await loadActivePersona(selectedAccountId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPersonaNotice(msg || 'Erro ao alterar persona.');
    }
  };

  const openCreatePersona = () => {
    setEditingPersona(null);
    setPersonaForm({ name: '', description: '', systemPrompt: '' });
    setShowPersonaModal(true);
  };

  const openEditPersona = (p: Persona) => {
    setEditingPersona(p);
    setPersonaForm({
      name: p.name,
      description: p.description || '',
      systemPrompt: p.systemPrompt,
    });
    setShowPersonaModal(true);
  };

  const closePersonaModal = () => {
    setShowPersonaModal(false);
    setEditingPersona(null);
  };

  const handleSavePersona = async () => {
    if (!personaForm.name.trim() || !personaForm.systemPrompt.trim()) {
      setPersonaNotice('Nome e System Prompt são obrigatórios.');
      return;
    }
    setSavingPersona(true);
    setPersonaNotice(null);
    try {
      if (editingPersona) {
        await api.put(`/api/discord/personas/${editingPersona.id}`, personaForm);
        setPersonaNotice('Persona atualizada com sucesso.');
      } else {
        await api.post('/api/discord/personas', personaForm);
        setPersonaNotice('Persona criada com sucesso.');
      }
      closePersonaModal();
      await loadPersonas();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPersonaNotice(msg || 'Erro ao salvar persona.');
    } finally {
      setSavingPersona(false);
    }
  };

  const handleDeletePersona = async (persona: Persona) => {
    if (!window.confirm(`Remover a persona "${persona.name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setDeletingPersona(true);
    setPersonaNotice(null);
    try {
      await api.delete(`/api/discord/personas/${persona.id}`);
      setPersonaNotice('Persona removida.');
      await loadPersonas();
      if (selectedAccountId) await loadActivePersona(selectedAccountId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPersonaNotice(msg || 'Erro ao remover persona.');
    } finally {
      setDeletingPersona(false);
    }
  };

  // ========================= ACCOUNT ACTIONS =========================

  const handleCreate = async () => {
    if (!newName.trim() || !newToken.trim()) {
      setCreateError('Informe o nome e o token da conta.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await api.post('/api/discord/accounts', {
        name: newName.trim(),
        token: newToken.trim(),
      });
      setNewName('');
      setNewToken('');
      setShowAdd(false);
      await loadAccounts();
      setNotice('Conta adicionada com sucesso.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCreateError(msg || 'Erro ao adicionar conta');
    } finally {
      setCreating(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedAccount) return;
    setActionLoading(true);
    setNotice(null);
    try {
      await api.post(`/api/discord/accounts/${selectedAccount.id}/connect`);
      await loadAccounts();
      setNotice('Comando de conexão enviado.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice(msg || 'Erro ao conectar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!selectedAccount) return;
    setActionLoading(true);
    setNotice(null);
    try {
      await api.post(`/api/discord/accounts/${selectedAccount.id}/disconnect`);
      await loadAccounts();
      setNotice('Conta desconectada.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice(msg || 'Erro ao desconectar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;
    if (!window.confirm(`Remover a conta "${selectedAccount.name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setActionLoading(true);
    setNotice(null);
    try {
      await api.delete(`/api/discord/accounts/${selectedAccount.id}`);
      setSelectedAccountId(null);
      setSelectedConvId(null);
      await loadAccounts();
      setNotice('Conta removida.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice(msg || 'Erro ao remover conta');
    } finally {
      setActionLoading(false);
    }
  };

  const updateConfig = (patch: Partial<DiscordConfig>) =>
    setConfig((prev) => ({ ...(prev || {}), ...patch }));

  const handleSaveConfig = async () => {
    if (!selectedAccount || !config) return;
    setSavingConfig(true);
    setNotice(null);
    try {
      await api.put(`/api/discord/accounts/${selectedAccount.id}/config`, {
        enabled: !!config.enabled,
        replyToDms: !!config.replyToDms,
        replyToMentions: !!config.replyToMentions,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        agentConfig: config.agentConfig ?? undefined,
        scope: config.scope ?? undefined,
        engagementEnabled: !!config.engagementEnabled,
        engagementPlan: config.engagementPlan ?? undefined,
      });
      await loadAccounts();
      setNotice('Configurações salvas.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice(msg || 'Erro ao salvar configurações');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleLoadMore = () => {
    if (!selectedConvId || !messages.length || loadingMore) return;
    const oldest = messages[0];
    if (oldest) {
      loadMessages(selectedConvId, oldest.id, true);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedConvId) return;
    setAnalyzing(true);
    setNotice(null);
    try {
      // Attempt to trigger analysis via backend; the endpoint may not exist yet
      // but we try gracefully
      await api.post(`/api/discord/conversations/${selectedConvId}/analyze`);
      setNotice('Análise de assinatura iniciada. Atualize em alguns instantes.');
    } catch (err: unknown) {
      // Analysis endpoint might not be implemented yet — show a helpful message
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setNotice('O endpoint de análise não está disponível no momento. A assinatura será gerada automaticamente pelo serviço Discord.');
      } else {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setNotice(msg || 'Erro ao solicitar análise');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // ========================= TAKEOVER =========================

  const takeoverActive = selectedConv?.takeoverActive ?? false;

  const handleToggleTakeover = async () => {
    if (!selectedConvId || !selectedAccountId) return;
    setTakeoverLoading(true);
    setNotice(null);
    const newState = !takeoverActive;
    try {
      await api.post(`/api/discord/conversations/${selectedConvId}/takeover`, {
        active: newState,
      });
      // Optimistically update the conversations list
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConvId ? { ...c, takeoverActive: newState } : c,
        ),
      );
      setNotice(newState ? 'Você está no controle. A IA não responderá automaticamente.' : 'IA reativada. O agente voltará a responder automaticamente.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice(msg || 'Erro ao alterar modo de controle');
    } finally {
      setTakeoverLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConvId || !composeText.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/discord/conversations/${selectedConvId}/send-message`, {
        body: composeText.trim(),
      });
      setComposeText('');
      composeInputRef.current?.focus();
      // Reload messages to show the sent message
      await loadMessages(selectedConvId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice(msg || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleComposeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ========================= DERIVED =========================

  const initial = (selectedAccount?.username || selectedAccount?.name || '?').charAt(0).toUpperCase();

  const accountConnected = (selectedAccount?.status || '').toUpperCase() === 'CONNECTED';

  // ========================= RENDER =========================

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#313338] text-[#dbdee1]">
      {/* ================================================================ */}
      {/* STATUS BAR — full-width, bg #1e1f22                              */}
      {/* ================================================================ */}
      <div className="flex shrink-0 items-center gap-6 border-b border-[#2b2d31] bg-[#1e1f22] px-4 py-2 text-[12px]">
        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          {accountConnected ? (
            <Wifi className="h-3.5 w-3.5 text-[#23a55a]" />
          ) : statusPolling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f0b232]" />
          ) : selectedAccount?.status?.toUpperCase() === 'ERROR' ? (
            <WifiOff className="h-3.5 w-3.5 text-[#f23f43]" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-[#80848e]" />
          )}
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: statusColor(selectedAccount?.status) }}
          />
          <span className="font-medium text-[#dbdee1]">
            {selectedAccount
              ? accountConnected
                ? `Conectado como ${selectedAccount.username || selectedAccount.name}`
                : statusPolling
                  ? 'Reconectando…'
                  : statusLabel(selectedAccount.status)
              : 'Desconectado'}
          </span>
          {selectedAccount?.status?.toUpperCase() === 'ERROR' && (
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              className="ml-1 rounded bg-[#f23f43]/15 px-2 py-0.5 text-[11px] text-[#fca5a5] hover:bg-[#f23f43]/30 disabled:opacity-50"
            >
              Tentar novamente
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-[#3f4147]" />

        {/* AI status */}
        <div className="flex items-center gap-1.5">
          <Brain className={cn('h-3.5 w-3.5', config?.enabled ? 'text-[#23a55a]' : 'text-[#80848e]')} />
          <span
            className={cn(
              'font-medium',
              config?.enabled ? 'text-[#23a55a]' : 'text-[#80848e]',
            )}
          >
            {config?.enabled ? 'IA ativa' : 'IA pausada'}
          </span>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-[#3f4147]" />

        {/* Persona active */}
        <div className="flex items-center gap-1.5">
          <VenetianMask
            className={cn('h-3.5 w-3.5', activePersona ? 'text-[#5865F2]' : 'text-[#80848e]')}
          />
          <span className={cn('font-medium', activePersona ? 'text-[#dbdee1]' : 'text-[#80848e]')}>
            {activePersona ? activePersona.name : 'Nenhum personagem'}
          </span>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-[#3f4147]" />

        {/* Last activity */}
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-[#80848e]" />
          <span className="text-[#949ba4]">
            Última mensagem:{' '}
            {lastActivityTime ? `há ${formatDiscordTime(lastActivityTime)}` : '—'}
          </span>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-[#3f4147]" />

        {/* Self-signature */}
        <div className="flex items-center gap-1.5">
          {selfSignature && selfSignature.messageCount > 0 ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-[#23a55a]" />
              <span className="font-medium text-[#23a55a]">Assinatura analisada</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-[#80848e]" />
              <span className="text-[#80848e]">Não analisada</span>
            </>
          )}
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ================================================================ */}
        {/* LEFT SIDEBAR — bg #1e1f22, width 240px                           */}
        {/* ================================================================ */}
      <div className="flex w-[240px] shrink-0 flex-col bg-[#1e1f22]">
        {/* Account selector dropdown */}
        <div className="border-b border-[#2b2d31] px-2 py-3">
          {accountsLoading ? (
            <div className="flex items-center gap-2 px-2 py-1 text-sm text-[#949ba4]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas...
            </div>
          ) : accounts.length === 0 ? (
            <div className="px-2">
              <p className="text-sm text-[#949ba4]">Nenhuma conta.</p>
              <button
                onClick={() => setShowAdd(true)}
                className="mt-1 flex items-center gap-1 text-sm text-[#5865F2] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </button>
            </div>
          ) : (
            <>
              <label className="block px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                Conta
              </label>
              <div className="relative">
                <select
                  value={selectedAccountId || ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedAccountId(id || null);
                    setShowAdd(false);
                  }}
                  className="w-full appearance-none rounded bg-[#1e1f22] px-2 py-1.5 pr-8 text-sm text-[#dbdee1] outline-none ring-1 ring-[#404249] focus:ring-[#5865F2]"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.username || acc.name}
                    </option>
                  ))}
                  <option value="">— Adicionar conta —</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#949ba4]" />
              </div>
            </>
          )}
          {accountsLoading && (
            <button
              onClick={loadAccounts}
              className="mt-1 flex items-center gap-1 px-2 text-xs text-[#5865F2] hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Atualizar
            </button>
          )}
        </div>

        {/* Search / filter */}
        <div className="border-b border-[#2b2d31] px-2 py-2">
          <div className="flex items-center gap-1.5 rounded bg-[#2b2d31] px-2 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-[#949ba4]" />
            <input
              type="text"
              placeholder="Buscar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[#dbdee1] outline-none placeholder:text-[#80848e]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[#80848e] hover:text-[#dbdee1]"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {!selectedAccountId ? (
            <div className="px-4 py-8 text-center text-sm text-[#949ba4]">
              Selecione uma conta acima para ver as conversas.
            </div>
          ) : convsLoading ? (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-[#949ba4]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando conversas...
            </div>
          ) : convsError ? (
            <div className="px-4 py-4">
              <p className="flex items-center gap-1.5 text-sm text-[#fca5a5]">
                <AlertTriangle className="h-4 w-4" /> {convsError}
              </p>
              <button
                onClick={() => selectedAccountId && loadConversations(selectedAccountId)}
                className="mt-2 flex items-center gap-1 text-xs text-[#5865F2] hover:underline"
              >
                <RefreshCw className="h-3 w-3" /> Tentar novamente
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#949ba4]">
              {searchQuery ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
            </div>
          ) : (
            <>
              {/* CONVERSAS (DMs) */}
              {grouped.dms.length > 0 && (
                <div className="mt-1">
                  <p className="px-3 pb-0.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                    CONVERSAS
                  </p>
                  {grouped.dms.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      active={conv.id === selectedConvId}
                      onClick={() => setSelectedConvId(conv.id)}
                    />
                  ))}
                </div>
              )}

              {/* SERVIDORES (guild channels) */}
              {grouped.guilds.map((guild) => (
                <div key={guild.guildId || 'noguild'} className="mt-1">
                  <p className="px-3 pb-0.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                    {guild.guildName.toUpperCase()}
                  </p>
                  {guild.channels.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      active={conv.id === selectedConvId}
                      onClick={() => setSelectedConvId(conv.id)}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {/* User panel footer */}
        <div className="flex items-center gap-2 bg-[#232428] px-2 py-2">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full"
            style={{ backgroundColor: selectedAccount?.avatarUrl ? 'transparent' : avatarColor(selectedAccount?.username || selectedAccount?.name) }}
          >
            {selectedAccount?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedAccount.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-white">{initial}</span>
            )}
            {selectedAccount && (
              <span
                className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#232428]"
                style={{ backgroundColor: statusColor(selectedAccount.status) }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {selectedAccount?.username || selectedAccount?.name || 'Sem conta'}
            </p>
            <p className="truncate text-[12px] text-[#949ba4]">
              {selectedAccount ? statusLabel(selectedAccount.status) : '—'}
            </p>
          </div>
          <div className="flex gap-0.5">
            <button
              onClick={loadAccounts}
              title="Atualizar contas"
              className="rounded p-1 text-[#b5bac1] hover:bg-[#3f4147] hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push('/discord/queue')}
              title="Fila de engajamento"
              className="rounded p-1 text-[#b5bac1] hover:bg-[#3f4147] hover:text-white"
            >
              <Inbox className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* CENTER — Message history, bg #313338, flex-1                      */}
      {/* ================================================================ */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#313338]">
        {/* Show add-account form if needed */}
        {showAdd || (!accountsLoading && accounts.length === 0) ? (
          <>
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#26272b] px-4 shadow-[0_1px_0_rgba(0,0,0,0.1)]">
              <Hash className="h-6 w-6 text-[#80848e]" />
              <span className="font-semibold text-white">adicionar-conta</span>
              <div className="mx-3 h-6 w-px bg-[#3f4147]" />
              <span className="truncate text-sm text-[#949ba4]">
                Conecte uma conta do Discord ao agente
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {notice && (
                <div className="mb-4 rounded-md bg-[#5865F2]/15 px-4 py-2 text-sm text-[#c9cdfb]">
                  {notice}
                </div>
              )}
              {accountsError && (
                <div className="mb-4 flex items-center gap-2 rounded-md bg-[#f23f43]/15 px-4 py-2 text-sm text-[#fca5a5]">
                  <AlertTriangle className="h-4 w-4" /> {accountsError}
                </div>
              )}
              <AddAccountForm
                newName={newName}
                newToken={newToken}
                setNewName={setNewName}
                setNewToken={setNewToken}
                creating={creating}
                createError={createError}
                onCreate={handleCreate}
                onCancel={
                  accounts.length > 0
                    ? () => {
                        setShowAdd(false);
                        setSelectedAccountId(accounts[0]?.id || null);
                        setCreateError(null);
                      }
                    : undefined
                }
              />
            </div>
          </>
        ) : !selectedConvId ? (
          /* Empty state — no conversation selected */
          <>
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#26272b] px-4 shadow-[0_1px_0_rgba(0,0,0,0.1)]">
              <Hash className="h-6 w-6 text-[#80848e]" />
              <span className="font-semibold text-white">
                {selectedAccount ? selectedAccount.name : 'Discord'}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageCircle className="mx-auto h-12 w-12 text-[#404249]" />
                <p className="mt-4 text-[#949ba4]">Selecione uma conversa</p>
                <p className="mt-1 text-sm text-[#80848e]">
                  Escolha uma conversa na barra lateral para ver as mensagens.
                </p>
              </div>
            </div>
          </>
        ) : (
          /* Message history view */
          <>
            {/* Channel header */}
            <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[#26272b] px-4 shadow-[0_1px_0_rgba(0,0,0,0.1)]">
              {/* Avatar */}
              {selectedConv?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedConv.avatarUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{
                    backgroundColor:
                      selectedConv?.channelType === 'DM'
                        ? avatarColor(selectedConv?.contactName)
                        : '#5865F2',
                  }}
                >
                  {selectedConv?.channelType === 'DM' ? (
                    avatarInitial(selectedConv?.contactName)
                  ) : (
                    <HashIcon className="h-4 w-4" />
                  )}
                </div>
              )}

              {/* Name + badge */}
              <div className="min-w-0 flex flex-col">
                <span className="truncate font-semibold text-white text-[15px] leading-tight">
                  {selectedConv?.contactName || selectedConv?.channelId || 'Conversa'}
                </span>
                <span className="truncate text-[11px] leading-tight text-[#80848e]">
                  {selectedConv?.channelType === 'DM'
                    ? 'DM'
                    : selectedConv?.guildName || 'Servidor'}
                </span>
              </div>

              {selectedConv && (
                <span className="ml-auto shrink-0 text-xs text-[#80848e]">
                  {selectedConv.messageCount} mensagens
                </span>
              )}
              {selectedConv && (
                <button
                  onClick={handleToggleTakeover}
                  disabled={takeoverLoading}
                  className={cn(
                    'shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60',
                    takeoverActive
                      ? 'bg-[#f23f43]/15 text-[#fca5a5] hover:bg-[#f23f43]/25 border border-[#f23f43]/30'
                      : 'bg-[#5865F2]/15 text-[#c9cdfb] hover:bg-[#5865F2]/25 border border-[#5865F2]/30',
                  )}
                  title={takeoverActive ? 'Liberar IA' : 'Assumir controle manual'}
                >
                  {takeoverLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : takeoverActive ? (
                    'LIBERAR IA'
                  ) : (
                    'ASSUMIR CONVERSA'
                  )}
                </button>
              )}
            </div>

            {/* Takeover banner */}
            {takeoverActive && selectedConv && (
              <div className="flex items-center gap-2 bg-[#f0b232]/15 border-b border-[#f0b232]/20 px-4 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#f0b232]" />
                <span className="text-sm font-medium text-[#f0b232]">
                  Voc&ecirc; est&aacute; no controle
                </span>
                <span className="text-xs text-[#c49422]">
                  A IA n&atilde;o responder&aacute; automaticamente. Use a caixa abaixo para enviar mensagens manualmente.
                </span>
              </div>
            )}

            {/* Message list */}
            <div ref={messageListRef} className="flex-1 overflow-y-auto">
              {notice && (
                <div className="mx-4 mt-3 rounded-md bg-[#5865F2]/15 px-4 py-2 text-sm text-[#c9cdfb]">
                  {notice}
                </div>
              )}

              {hasMoreMsgs && (
                <div className="flex justify-center py-3">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 rounded bg-[#2b2d31] px-4 py-1.5 text-xs text-[#b5bac1] hover:bg-[#404249] disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    Carregar mais
                  </button>
                </div>
              )}

              {msgsLoading ? (
                <div className="flex items-center gap-2 px-6 py-8 text-sm text-[#949ba4]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando mensagens...
                </div>
              ) : msgsError ? (
                <div className="px-6 py-8">
                  <p className="flex items-center gap-1.5 text-sm text-[#fca5a5]">
                    <AlertTriangle className="h-4 w-4" /> {msgsError}
                  </p>
                  <button
                    onClick={() => loadMessages(selectedConvId)}
                    className="mt-2 flex items-center gap-1 text-xs text-[#5865F2] hover:underline"
                  >
                    <RefreshCw className="h-3 w-3" /> Tentar novamente
                  </button>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageCircle className="h-10 w-10 text-[#404249]" />
                  <p className="mt-3 text-sm text-[#949ba4]">Nenhuma mensagem ainda.</p>
                  <p className="mt-1 text-xs text-[#80848e]">
                    As mensagens desta conversa aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div className="pb-4">
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      contactName={selectedConv?.contactName || 'Contato'}
                      accountName={selectedAccount?.username || selectedAccount?.name || 'Você'}
                      accountAvatarUrl={selectedAccount?.avatarUrl}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message compose box (takeover mode only) */}
            {takeoverActive && selectedConv && (
              <div className="shrink-0 border-t border-[#26272b] bg-[#313338] px-4 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={composeInputRef}
                    value={composeText}
                    onChange={(e) => setComposeText(e.target.value)}
                    onKeyDown={handleComposeKeyDown}
                    placeholder={`Enviar como ${selectedAccount?.username || selectedAccount?.name || 'Você'}...`}
                    rows={2}
                    className="flex-1 resize-none rounded-md bg-[#383a40] px-3 py-2 text-[15px] text-[#dbdee1] placeholder:text-[#80848e] outline-none focus:ring-1 focus:ring-[#5865F2]"
                    disabled={sending}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !composeText.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#5865F2] text-white transition-colors hover:bg-[#4752c4] disabled:opacity-40"
                    title="Enviar mensagem"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[#80848e]">
                  Enter para enviar &middot; Shift+Enter para nova linha
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ================================================================ */}
      {/* RIGHT PANEL — bg #2b2d31, width 280px                             */}
      {/* ================================================================ */}
      <div className="flex w-[280px] shrink-0 flex-col bg-[#2b2d31] border-l border-[#1e1f22]">
        {/* Tab selector */}
        <div className="flex border-b border-[#1e1f22]">
          <button
            onClick={() => setRightTab('conta')}
            className={cn(
              'flex-1 py-2.5 text-center text-sm font-medium transition-colors',
              rightTab === 'conta'
                ? 'text-white border-b-2 border-[#5865F2] bg-[#313338]/50'
                : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]'
            )}
          >
            Conta
          </button>
          <button
            onClick={() => setRightTab('assinatura')}
            className={cn(
              'flex-1 py-2.5 text-center text-sm font-medium transition-colors',
              rightTab === 'assinatura'
                ? 'text-white border-b-2 border-[#5865F2] bg-[#313338]/50'
                : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]'
            )}
          >
            Assinatura
          </button>
          <button
            onClick={() => setRightTab('persona')}
            className={cn(
              'flex-1 py-2.5 text-center text-sm font-medium transition-colors',
              rightTab === 'persona'
                ? 'text-white border-b-2 border-[#5865F2] bg-[#313338]/50'
                : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]'
            )}
          >
            Persona
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rightTab === 'persona' && (
            /* ========== PERSONA TAB ========== */
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto p-3">
                {!selectedAccountId ? (
                  <div className="py-8 text-center text-sm text-[#949ba4]">
                    Selecione uma conta para gerenciar personas.
                  </div>
                ) : (
                  <>
                    {/* Active persona indicator */}
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#313338] px-3 py-2">
                      <Shapes className="h-4 w-4 shrink-0 text-[#5865F2]" />
                      <span className="text-xs text-[#dbdee1]">
                        {activePersona
                          ? `Persona ativo: ${activePersona.name}`
                          : 'Nenhum persona ativo'}
                      </span>
                    </div>

                    {personaNotice && (
                      <div className="mb-3 rounded-md bg-[#5865F2]/15 px-3 py-2 text-xs text-[#c9cdfb]">
                        {personaNotice}
                      </div>
                    )}

                    {/* Active persona dropdown */}
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                      Persona ativo
                    </label>
                    {personaLoading ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-[#949ba4]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
                      </div>
                    ) : (
                      <div className="relative mb-3">
                        <select
                          value={activePersona?.id || ''}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            handleSetActivePersona(id);
                          }}
                          className="w-full appearance-none rounded bg-[#1e1f22] px-2 py-2 pr-8 text-sm text-[#dbdee1] outline-none ring-1 ring-[#404249] focus:ring-[#5865F2]"
                        >
                          <option value="">Nenhum</option>
                          {personas
                            .filter((p) => p.isActive)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#949ba4]" />
                      </div>
                    )}

                    {/* Manage personas button */}
                    <button
                      onClick={() => {
                        setShowPersonaModal(true);
                        setEditingPersona(null);
                        setPersonaForm({ name: '', description: '', systemPrompt: '' });
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
                    >
                      <Users className="h-4 w-4" />
                      Gerenciar Personas
                    </button>

                    {/* Active persona preview */}
                    {activePersona && (
                      <div className="mt-4 rounded-lg bg-[#313338] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#80848e]">
                          System Prompt
                        </p>
                        <p className="mt-1 font-mono text-xs leading-relaxed text-[#dbdee1] whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                          {activePersona.systemPrompt}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {rightTab === 'conta' && (
            /* ========== CONTA TAB ========== */
            <div className="p-3">
              {!selectedAccount ? (
                <div className="py-8 text-center text-sm text-[#949ba4]">
                  Selecione uma conta para ver as configurações.
                </div>
              ) : (
                <>
                  {/* Account info card */}
                  <div className="mb-4 flex items-center gap-3 rounded-lg bg-[#313338] p-3">
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
                      style={{ backgroundColor: selectedAccount?.avatarUrl ? 'transparent' : avatarColor(selectedAccount?.username || selectedAccount?.name) }}
                    >
                      {selectedAccount.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selectedAccount.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-lg font-semibold text-white">{initial}</span>
                      )}
                      <span
                        className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-[#313338]"
                        style={{ backgroundColor: statusColor(selectedAccount.status) }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {selectedAccount.username || selectedAccount.name}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-[#949ba4]">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: statusColor(selectedAccount.status) }}
                        />
                        {statusLabel(selectedAccount.status)}
                      </p>
                    </div>
                  </div>

                  {/* Connect / Disconnect */}
                  <div className="mb-3 flex gap-2">
                    {accountConnected ? (
                      <button
                        onClick={handleDisconnect}
                        disabled={actionLoading}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded bg-[#f23f43] px-3 py-2 text-xs font-medium text-white hover:bg-[#da373c] disabled:opacity-60"
                      >
                        <PowerOff className="h-3.5 w-3.5" /> Desconectar
                      </button>
                    ) : (
                      <button
                        onClick={handleConnect}
                        disabled={actionLoading}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded bg-[#23a55a] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e9150] disabled:opacity-60"
                      >
                        {actionLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plug className="h-3.5 w-3.5" />
                        )}
                        Conectar
                      </button>
                    )}
                    <button
                      onClick={handleDelete}
                      disabled={actionLoading}
                      title="Remover conta"
                      className="rounded bg-[#404249] p-2 text-[#dbdee1] hover:bg-[#f23f43] hover:text-white disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Toggles */}
                  {configLoading ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-[#949ba4]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando configurações...
                    </div>
                  ) : !config ? (
                    <div className="py-4 text-xs text-[#949ba4]">
                      Nenhuma configuração disponível.
                    </div>
                  ) : (
                    <div className="rounded-lg bg-[#313338] px-3 py-1">
                      <DiscordToggle
                        label="IA ativada"
                        description="Permite que o agente de IA responda nesta conta."
                        checked={!!config.enabled}
                        onChange={(v) => updateConfig({ enabled: v })}
                      />
                      <DiscordToggle
                        label="Responder DMs"
                        description="Responde automaticamente a mensagens diretas."
                        checked={!!config.replyToDms}
                        onChange={(v) => updateConfig({ replyToDms: v })}
                      />
                      <DiscordToggle
                        label="Responder menções"
                        description="Responde quando a conta é mencionada."
                        checked={!!config.replyToMentions}
                        onChange={(v) => updateConfig({ replyToMentions: v })}
                      />
                      <DiscordToggle
                        label="Modo engajamento"
                        description="Gera mensagens proativas para aprovação."
                        checked={!!config.engagementEnabled}
                        onChange={(v) => updateConfig({ engagementEnabled: v })}
                      />
                    </div>
                  )}

                  {/* Save config */}
                  {config && (
                    <button
                      onClick={handleSaveConfig}
                      disabled={savingConfig || configLoading}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-60"
                    >
                      {savingConfig && <Loader2 className="h-4 w-4 animate-spin" />}
                      Salvar configurações
                    </button>
                  )}

                  {/* Quick links */}
                  <div className="mt-3 border-t border-[#3f4147] pt-3">
                    <button
                      onClick={() => router.push('/discord/queue')}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-[#b5bac1] hover:bg-[#35373c]"
                    >
                      <Inbox className="h-3.5 w-3.5" /> Fila de engajamento
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {rightTab === 'assinatura' && (
            /* ========== ASSINATURA TAB ========== */
            <div className="flex flex-col h-full">
              {/* Self-signature indicator */}
              <div className="px-3 pt-3 pb-2 border-b border-[#1e1f22]">
                <div className="flex items-center gap-2 rounded-lg bg-[#313338] px-3 py-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: selectedAccount?.hasSelfSignature ? '#23a55a' : '#f0b232',
                    }}
                  />
                  <span className="text-xs text-[#dbdee1]">
                    {selectedAccount?.hasSelfSignature
                      ? 'IA escrevendo como você'
                      : 'IA escrevendo em estilo genérico'}
                  </span>
                </div>
              </div>

              {/* Sub-tab selector */}
              <div className="flex border-b border-[#1e1f22]">
                <button
                  onClick={() => setSignatureTab('self')}
                  className={cn(
                    'flex-1 py-2 text-center text-xs font-medium transition-colors',
                    signatureTab === 'self'
                      ? 'text-white border-b-2 border-[#5865F2] bg-[#313338]/50'
                      : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]',
                  )}
                >
                  Sua escrita
                </button>
                <button
                  onClick={() => setSignatureTab('partner')}
                  className={cn(
                    'flex-1 py-2 text-center text-xs font-medium transition-colors',
                    signatureTab === 'partner'
                      ? 'text-white border-b-2 border-[#5865F2] bg-[#313338]/50'
                      : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]',
                  )}
                >
                  Contato
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {signatureTab === 'self' ? (
                  /* ========== SELF-SIGNATURE ========== */
                  !selectedAccountId ? (
                    <div className="py-8 text-center text-sm text-[#949ba4]">
                      Selecione uma conta para ver sua assinatura de escrita.
                    </div>
                  ) : selfSigLoading ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-[#949ba4]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando sua assinatura...
                    </div>
                  ) : selfSigError ? (
                    <div>
                      <p className="flex items-center gap-1.5 text-xs text-[#fca5a5]">
                        <AlertTriangle className="h-3.5 w-3.5" /> {selfSigError}
                      </p>
                      <button
                        onClick={() => selectedAccountId && loadSelfSignature(selectedAccountId)}
                        className="mt-2 flex items-center gap-1 text-xs text-[#5865F2] hover:underline"
                      >
                        <RefreshCw className="h-3 w-3" /> Tentar novamente
                      </button>
                    </div>
                  ) : selfSignature && selfSignature.messageCount > 0 ? (
                    <>
                      {/* Self account info */}
                      <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#313338] p-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: avatarColor(selectedAccount?.username || selectedAccount?.name) }}
                        >
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {selectedAccount?.username || selectedAccount?.name || 'Você'}
                          </p>
                          {selfSignature.analyzedAt && (
                            <p className="text-[11px] text-[#80848e]">
                              Analisado em {formatFullTime(selfSignature.analyzedAt)}
                            </p>
                          )}
                        </div>
                      </div>

                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                        Traços de escrita
                      </p>
                      <div className="space-y-1.5">
                        {Object.entries(selfSignature)
                          .filter(([k]) => k !== 'analyzedAt')
                          .map(([key, value]) => (
                            <div
                              key={key}
                              className="rounded-lg bg-[#313338] px-3 py-2"
                            >
                              <p className="text-[11px] font-semibold uppercase text-[#80848e]">
                                {SIGNATURE_LABELS_PT[key] || key}
                              </p>
                              <p className="mt-0.5 text-sm text-[#dbdee1]">
                                {formatTraitValue(key, value)}
                              </p>
                            </div>
                          ))}
                      </div>

                      <button
                        onClick={handleSelfAnalysis}
                        disabled={analyzingSelf}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-[#404249] px-3 py-2 text-xs font-medium text-[#dbdee1] hover:bg-[#4e5058] disabled:opacity-60"
                      >
                        {analyzingSelf ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Reanalisar sua escrita
                      </button>
                    </>
                  ) : (
                    <div className="rounded-lg bg-[#313338] p-4 text-center">
                      <FileText className="mx-auto h-8 w-8 text-[#80848e]" />
                      <p className="mt-2 text-sm text-[#dbdee1]">
                        Sua assinatura de escrita ainda não foi analisada.
                      </p>
                      <p className="mt-1 text-xs text-[#949ba4]">
                        Analise para que a IA escreva como você.
                      </p>
                      <button
                        onClick={handleSelfAnalysis}
                        disabled={analyzingSelf}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-[#5865F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752c4] disabled:opacity-60"
                      >
                        {analyzingSelf ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Analisar sua escrita
                      </button>
                    </div>
                  )
                ) : (
                  /* ========== PARTNER-SIGNATURE ========== */
                  !selectedConvId ? (
                    <div className="py-8 text-center text-sm text-[#949ba4]">
                      Selecione uma conversa para ver a assinatura de escrita.
                    </div>
                  ) : sigLoading ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-[#949ba4]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando assinatura...
                    </div>
                  ) : sigError ? (
                    <div>
                      <p className="flex items-center gap-1.5 text-xs text-[#fca5a5]">
                        <AlertTriangle className="h-3.5 w-3.5" /> {sigError}
                      </p>
                      <button
                        onClick={() => selectedConvId && loadSignature(selectedConvId)}
                        className="mt-2 flex items-center gap-1 text-xs text-[#5865F2] hover:underline"
                      >
                        <RefreshCw className="h-3 w-3" /> Tentar novamente
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Contact info */}
                      <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#313338] p-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: avatarColor(selectedConv?.contactName) }}
                        >
                          {avatarInitial(selectedConv?.contactName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {selectedConv?.contactName || 'Contato'}
                          </p>
                          {signature?.signatureUpdatedAt && (
                            <p className="text-[11px] text-[#80848e]">
                              Analisado em {formatFullTime(signature.signatureUpdatedAt)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Signature content */}
                      {signature?.hasSignature && signature.writingSignature ? (
                        <>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                            Traços de escrita
                          </p>
                          <div className="space-y-1.5">
                            {parseSignatureTraits(signature.writingSignature).map((trait) => (
                              <div
                                key={trait.key}
                                className="rounded-lg bg-[#313338] px-3 py-2"
                              >
                                <p className="text-[11px] font-semibold uppercase text-[#80848e]">
                                  {SIGNATURE_LABELS_PT[trait.key] || trait.key}
                                </p>
                                <p className="mt-0.5 text-sm text-[#dbdee1]">
                                  {trait.value}
                                </p>
                              </div>
                            ))}
                          </div>

                          <button
                            onClick={handleAnalyze}
                            disabled={analyzing}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-[#404249] px-3 py-2 text-xs font-medium text-[#dbdee1] hover:bg-[#4e5058] disabled:opacity-60"
                          >
                            {analyzing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Reanalisar
                          </button>
                        </>
                      ) : (
                        <div className="rounded-lg bg-[#313338] p-4 text-center">
                          <FileText className="mx-auto h-8 w-8 text-[#80848e]" />
                          <p className="mt-2 text-sm text-[#dbdee1]">
                            Nenhuma assinatura
                          </p>
                          <p className="mt-1 text-xs text-[#949ba4]">
                            Analise esta conversa para descobrir o estilo de escrita do contato.
                          </p>
                          <button
                            onClick={handleAnalyze}
                            disabled={analyzing}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-[#5865F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752c4] disabled:opacity-60"
                          >
                            {analyzing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            Analisar
                          </button>
                        </div>
                      )}
                    </>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* End three-panel layout */}
      </div>

      {/* ================================================================ */}
      {/* PERSONA MODAL                                                    */}
      {/* ================================================================ */}
      {showPersonaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-[#2b2d31] shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[#1e1f22] px-4 py-3">
              <h2 className="text-base font-semibold text-white">
                {editingPersona ? 'Editar Persona' : 'Nova Persona'}
              </h2>
              <button
                onClick={closePersonaModal}
                className="rounded p-1 text-[#b5bac1] hover:bg-[#35373c] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Persona list (in create mode — lets user see existing before creating new) */}
            {!editingPersona && personas.length > 0 && (
              <div className="max-h-48 overflow-y-auto border-b border-[#1e1f22] p-2">
                {personasLoading ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-xs text-[#949ba4]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando personas...
                  </div>
                ) : (
                  personas.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[#35373c]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#dbdee1] truncate">
                          {p.name}
                          {p.id === activePersona?.id && (
                            <span className="ml-1.5 rounded bg-[#5865F2]/20 px-1.5 py-0.5 text-[10px] text-[#c9cdfb]">
                              ATIVO
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-[#80848e] truncate">
                          {p.description || 'Sem descrição'}
                        </p>
                      </div>
                      <button
                        onClick={() => openEditPersona(p)}
                        className="rounded p-1.5 text-[#b5bac1] hover:bg-[#404249] hover:text-white"
                        title="Editar"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePersona(p)}
                        disabled={deletingPersona}
                        className="rounded p-1.5 text-[#b5bac1] hover:bg-[#f23f43] hover:text-white disabled:opacity-50"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Form */}
            <div className="p-4 space-y-4">
              {personaNotice && (
                <div className="rounded-md bg-[#5865F2]/15 px-3 py-2 text-xs text-[#c9cdfb]">
                  {personaNotice}
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1]">
                  Nome
                </label>
                <input
                  value={personaForm.name}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex.: Ana, Coach Financeiro, Amigo..."
                  className="w-full rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2 text-sm text-[#dbdee1] outline-none focus:border-[#5865F2] placeholder:text-[#80848e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1]">
                  Descrição (opcional)
                </label>
                <input
                  value={personaForm.description}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Breve descrição do personagem..."
                  className="w-full rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2 text-sm text-[#dbdee1] outline-none focus:border-[#5865F2] placeholder:text-[#80848e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1]">
                  System Prompt
                </label>
                <p className="mb-1 text-[11px] text-[#80848e]">
                  Este texto define o personagem que a IA vai incorporar. Escreva livremente.
                </p>
                <textarea
                  value={personaForm.systemPrompt}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder={'You are Ana, a 25-year-old Brazilian woman. You speak casually with slang. You’re flirty and playful. You use lots of emojis. You talk about Revolut, money, and helping people get their accounts set up. You NEVER sound like a robot. You write in Portuguese (pt-BR) with a Rio de Janeiro accent...'}
                  rows={10}
                  className="w-full rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2 font-mono text-xs leading-relaxed text-[#dbdee1] outline-none focus:border-[#5865F2] placeholder:text-[#4e5058] resize-y"
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[#1e1f22] px-4 py-3">
              <button
                onClick={closePersonaModal}
                className="rounded px-4 py-2 text-sm font-medium text-[#dbdee1] hover:underline"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePersona}
                disabled={savingPersona || !personaForm.name.trim() || !personaForm.systemPrompt.trim()}
                className="flex items-center gap-2 rounded bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-60"
              >
                {savingPersona ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {editingPersona ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single conversation item in the left sidebar. */
function ConversationItem({
  conv,
  active,
  onClick,
}: {
  conv: DiscordConversation;
  active: boolean;
  onClick: () => void;
}) {
  const isDM = conv.channelType === 'DM';
  const name = conv.contactName || (isDM ? 'DM' : conv.channelId);

  return (
    <button
      onClick={onClick}
      className={cn(
        'mx-1 mb-0.5 flex w-[calc(100%-8px)] items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors',
        active ? 'bg-[#404249] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]',
      )}
    >
      {/* Avatar */}
      {conv.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={conv.avatarUrl}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: isDM ? avatarColor(name) : '#5865F2' }}
        >
          {isDM ? (
            avatarInitial(name)
          ) : (
            <HashIcon className="h-4 w-4" />
          )}
        </div>
      )}

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium">{name}</span>
          {conv.unreadCount ? (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#f23f43] px-1 text-[10px] font-bold text-white">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[12px] text-[#80848e]">
          {(conv.lastMessage ? truncate(conv.lastMessage, 45) : ' ')}
        </p>
      </div>

      {/* Time */}
      {conv.lastMessageTime && (
        <span className="shrink-0 text-[10px] text-[#80848e]">
          {formatDiscordTime(conv.lastMessageTime)}
        </span>
      )}
    </button>
  );
}

/** A single message bubble in the center panel. */
function MessageBubble({
  message,
  contactName,
  accountName,
  accountAvatarUrl,
}: {
  message: DiscordMessage;
  contactName: string;
  accountName: string;
  accountAvatarUrl: string | null | undefined;
}) {
  const displayName = message.fromMe ? accountName : contactName;
  const initial = avatarInitial(displayName);

  return (
    <div
      className={cn(
        'group flex gap-4 px-4 py-1 hover:bg-[#2e3035]',
      )}
    >
      {/* Avatar */}
      <div className="flex shrink-0 pt-0.5">
        {message.fromMe && accountAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={accountAvatarUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{
              backgroundColor: message.fromMe
                ? avatarColor(accountName)
                : avatarColor(contactName),
            }}
          >
            {initial}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="font-semibold text-[15px]"
            style={{ color: message.fromMe ? '#5865F2' : '#dbdee1' }}
          >
            {displayName}
          </span>
          <span className="text-[11px] text-[#80848e]">
            {formatFullTime(message.timestamp)}
          </span>
          {message.aiProcessed && (
            <span className="flex items-center gap-0.5 rounded bg-[#5865F2]/15 px-1.5 py-px text-[10px] text-[#c9cdfb]">
              <Sparkles className="h-2.5 w-2.5" /> IA
            </span>
          )}
        </div>
        <p className="text-[15px] leading-relaxed text-[#dbdee1] whitespace-pre-wrap break-words">
          {message.body || ' '}
        </p>
      </div>
    </div>
  );
}

/** Add account form (shown when adding a new account or no accounts exist). */
function AddAccountForm({
  newName,
  newToken,
  setNewName,
  setNewToken,
  creating,
  createError,
  onCreate,
  onCancel,
}: {
  newName: string;
  newToken: string;
  setNewName: (v: string) => void;
  setNewToken: (v: string) => void;
  creating: boolean;
  createError: string | null;
  onCreate: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-1 text-xl font-bold text-white">Adicionar conta</h2>
      <p className="mb-5 text-sm text-[#949ba4]">
        Conecte uma conta pessoal do Discord ao agente de IA.
      </p>

      {/* Self-bot ban-risk warning */}
      <div className="mb-5 flex gap-3 rounded-md border border-[#f0b232]/40 bg-[#f0b232]/10 px-4 py-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#f0b232]" />
        <div className="text-[13px] leading-relaxed text-[#e3c08d]">
          <strong className="text-[#f0b232]">Atenção — risco de banimento.</strong>{' '}
          Este token é de uma <strong>conta pessoal</strong> do Discord (self-bot). O uso de
          automação com contas pessoais <strong>viola os Termos de Serviço do Discord</strong> e
          pode resultar no <strong>banimento permanente</strong> da conta. Use somente contas
          descartáveis e por sua conta e risco.
        </div>
      </div>

      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1]">
        Nome da conta
      </label>
      <input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="Ex.: Conta engajamento Revolut"
        className="mb-4 w-full rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2.5 text-[15px] text-[#dbdee1] outline-none focus:border-[#5865F2]"
      />

      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1]">
        Token da conta (pessoal)
      </label>
      <input
        type="password"
        value={newToken}
        onChange={(e) => setNewToken(e.target.value)}
        placeholder="••••••••••••••••••••••••"
        autoComplete="off"
        className="w-full rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2.5 text-[15px] text-[#dbdee1] outline-none focus:border-[#5865F2]"
      />
      <p className="mt-1.5 text-[12px] text-[#949ba4]">
        O token nunca é exibido novamente após o envio.
      </p>

      {createError && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#fca5a5]">
          <AlertTriangle className="h-4 w-4" /> {createError}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onCreate}
          disabled={creating}
          className="flex items-center gap-2 rounded bg-[#5865F2] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Adicionar conta
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded px-4 py-2.5 text-sm font-medium text-[#dbdee1] hover:underline"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
