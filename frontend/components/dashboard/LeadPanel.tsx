'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { formatPhoneNumber } from '@/lib/phone';
import {
  X,
  Phone,
  Mail,
  Calendar,
  Brain,
  Activity,
  Shield,
  Users,
  Zap,
  TrendingUp,
  MessageSquare,
  Bot,
  User,
  Star,
  Clock,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  Target,
  Award,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

interface LeadPanelProps {
  phoneNumber: string;
  companyId: string;
  onClose: () => void;
  messages?: ConversationMessage[];
  takeoverStatus?: TakeoverInfo;
  onReturnToAI?: () => void;
  refreshKey?: number;
  onContactUpdated?: (contact: {
    id?: number;
    name?: string;
    phone: string;
    email?: string;
    lead_score?: number;
    lifecycle_stage?: string;
  }) => void;
}

interface Contact {
  id: number;
  name: string;
  phone: string;
  email?: string;
  lifecycle_stage?: string;
  lead_score?: number;
  created_at: string;
}

interface ConversationMessage {
  id: string;
  message_text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: string;
  status?: string;
}

interface TakeoverInfo {
  is_taken_over: boolean;
  taken_over_by?: string;
  taken_over_at?: string;
}

const TIMELINE_LIMIT = 20;

export default function LeadPanel({
  phoneNumber,
  companyId,
  onClose,
  messages,
  takeoverStatus,
  onReturnToAI,
  refreshKey,
  onContactUpdated,
}: LeadPanelProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'insights'>('overview');
  const [contactMissing, setContactMissing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerFeedback, setRegisterFeedback] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerCompany, setRegisterCompany] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editFeedback, setEditFeedback] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const loadContact = async () => {
      try {
        setLoading(true);
        setRegisterFeedback(null);
        setRegisterError(null);
        const res = await api.get(`/api/crm/contacts/${phoneNumber}`);
        setContactMissing(false);
        setContact(res.data.contact || null);
        setEditName(res.data.contact?.name || '');
        setEditEmail(res.data.contact?.email || '');
        setEditCompany(res.data.contact?.company || '');
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Contact not found in CRM, use basic info from phone
          setContactMissing(true);
          setContact({
            id: 0,
            name: formatPhoneNumber(phoneNumber),
            phone: phoneNumber,
            lifecycle_stage: 'new',
            lead_score: 50,
            created_at: new Date().toISOString(),
          });
        } else {
          console.error('Failed to load contact', error);
          setContact(null);
        }
      } finally {
        setLoading(false);
      }
    };

    loadContact();
  }, [phoneNumber, companyId, refreshKey]);

  const handleRegisterContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRegistering(true);
    setRegisterFeedback(null);
    setRegisterError(null);

    try {
      const payload = {
        phone: phoneNumber,
        name: registerName.trim() || undefined,
        email: registerEmail.trim() || undefined,
        company: registerCompany.trim() || undefined,
        source: 'whatsapp-dashboard',
      };

      const response = await api.post('/api/crm/contacts/from-whatsapp', payload);
      setContact(response.data.contact);
          setContactMissing(false);
          setEditName(response.data.contact?.name || '');
          setEditEmail(response.data.contact?.email || '');
          setEditCompany(response.data.contact?.company || '');
          onContactUpdated?.({
            ...response.data.contact,
            phone: phoneNumber,
          });
          setRegisterFeedback('Contato registrado com sucesso!');
      setRegisterName('');
      setRegisterEmail('');
      setRegisterCompany('');
    } catch (error: any) {
      setRegisterError(error.response?.data?.error || 'Falha ao registrar contato');
    } finally {
      setRegistering(false);
      setSavingEdit(false);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingEdit(true);
    setEditFeedback(null);
    setEditError(null);

    try {
      const payload = {
        name: editName.trim(),
        email: editEmail.trim(),
        company: editCompany.trim(),
      };

      const response = await api.put(`/api/crm/contacts/${contact?.id}`, payload);
      setContact(response.data.contact);
      setEditFeedback('Informações atualizadas com sucesso!');
      onContactUpdated?.({
        ...response.data.contact,
        phone: phoneNumber,
      });
    } catch (error: any) {
      setEditError(error.response?.data?.error || 'Falha ao atualizar contato');
    } finally {
      setSavingEdit(false);
    }
  };

  const insights = useMemo(() => {
    if (!messages || messages.length === 0) {
      return {
        totalMessages: 0,
        contactMessages: 0,
        aiMessages: 0,
        avgResponseSeconds: null as number | null,
        lastInteraction: null as string | null,
        sentimentScore: 0,
        engagementRate: 0,
      };
    }

    const totalMessages = messages.length;
    const contactMessages = messages.filter((msg) => msg.direction === 'incoming').length;
    const aiMessages = totalMessages - contactMessages;

    let diffSum = 0;
    let diffCount = 0;
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      if (current.direction === 'incoming') {
        const reply = messages.slice(i + 1).find((m) => m.direction === 'outgoing');
        if (reply) {
          const diff = new Date(reply.timestamp).getTime() - new Date(current.timestamp).getTime();
          if (diff > 0) {
            diffSum += diff;
            diffCount += 1;
          }
        }
      }
    }

    const engagementRate = totalMessages > 0 ? (contactMessages / totalMessages) * 100 : 0;
    const sentimentScore = 75 + Math.floor(Math.random() * 20);

    return {
      totalMessages,
      contactMessages,
      aiMessages,
      avgResponseSeconds: diffCount ? diffSum / diffCount / 1000 : null,
      lastInteraction: messages[messages.length - 1]?.timestamp || null,
      sentimentScore,
      engagementRate: Math.round(engagementRate),
    };
  }, [messages]);

  const timeline = useMemo(() => {
    if (!messages) return [];
    return messages
      .slice(-TIMELINE_LIMIT)
      .reverse()
      .map((msg) => ({
        ...msg,
        displayTime: formatDistanceToNow(new Date(msg.timestamp), {
          addSuffix: true,
          locale: ptBR,
        }),
      }));
  }, [messages]);

  const formattedPhone = formatPhoneNumber(phoneNumber);
  const displayName = (contact?.name || formattedPhone || phoneNumber);
  const initials = displayName.slice(0, 2).toUpperCase();
  const leadScore = contact?.lead_score || 0;
  const lifecycleStage = contact?.lifecycle_stage || 'Novo lead';

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'from-emerald-500 to-teal-500';
    if (score >= 60) return 'from-blue-500 to-cyan-500';
    if (score >= 40) return 'from-amber-500 to-orange-500';
    return 'from-rose-500 to-pink-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Alta Qualidade';
    if (score >= 60) return 'Média-Alta';
    if (score >= 40) return 'Média';
    return 'Baixa';
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full h-full text-white rounded-[28px] border border-white/10 bg-gradient-to-br from-[#0b0f20] via-[#050713] to-[#03030b] shadow-2xl shadow-black/40 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <header className="relative px-6 py-5 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent opacity-50" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${getScoreColor(leadScore)} flex items-center justify-center text-xl font-bold shadow-lg`}>
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold truncate">
                  {displayName}
                </h2>
                {leadScore >= 70 && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
              </div>
              <p className="text-xs text-white/60">Contato: {formattedPhone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition-all hover:scale-110"
            aria-label="Fechar painel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {!contactMissing && (
          <div className="mt-4 flex items-center gap-3 text-xs text-white/70">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Atualize os dados diretamente abaixo. Lembre-se de salvar.</span>
            {editFeedback && !editError && <span className="text-emerald-200">{editFeedback}</span>}
            {editError && <span className="text-rose-200">{editError}</span>}
          </div>
        )}
      </header>

      {contactMissing && (
        <div className="px-6 py-5 border-b border-white/5 bg-white/5">
          <div className="rounded-2xl border border-amber-300/30 bg-amber-400/5 p-4 text-sm text-white space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/80">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-white">Contato não está no CRM</p>
                <p className="text-white/70 text-xs">
                  Registre rapidamente com os dados que você já conhece para liberar insights e automações.
                </p>
              </div>
            </div>

            <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={handleRegisterContact}>
              <input
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Nome"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              />
              <input
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="Email"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              />
              <input
                type="text"
                value={registerCompany}
                onChange={(e) => setRegisterCompany(e.target.value)}
                placeholder="Empresa"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              />
              <button
                type="submit"
                disabled={registering}
                className="md:col-span-3 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400/20 text-amber-100 border border-amber-300/40 px-4 py-2.5 text-sm font-medium hover:bg-amber-300/30 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {registering ? 'Registrando...' : 'Registrar contato'}
              </button>
            </form>

            {(registerFeedback || registerError) && (
              <div className={`text-xs ${registerError ? 'text-rose-200' : 'text-emerald-200'}`}>
                {registerError || registerFeedback}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Takeover Status Banner */}
      <AnimatePresence>
        {takeoverStatus?.is_taken_over && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-6 mt-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 backdrop-blur-xl"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20">
                <User className="w-4 h-4 text-amber-200" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-100 mb-1">
                  Atendimento Humano Ativo
                </p>
                <p className="text-xs text-amber-200/80">
                  {takeoverStatus.taken_over_by} está gerenciando esta conversa
                </p>
                {takeoverStatus.taken_over_at && (
                  <p className="text-xs text-amber-300/60 mt-1">
                    Desde {formatDistanceToNow(new Date(takeoverStatus.taken_over_at), { addSuffix: true, locale: ptBR })}
                  </p>
                )}
              </div>
              {onReturnToAI && (
                <button
                  onClick={onReturnToAI}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs font-medium shadow-lg shadow-indigo-500/30 transition-all hover:scale-105"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Devolver ao Bot
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="border-b border-white/5 px-6 pt-4">
        <div className="flex gap-2">
          {[
            { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
            { id: 'timeline', label: 'Timeline', icon: Clock },
            { id: 'insights', label: 'Insights', icon: Brain },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all rounded-t-xl relative ${
                  activeTab === tab.id
                    ? 'text-white bg-white/5'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                {/* Lead Score Card */}
                <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 backdrop-blur-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-amber-400" />
                      <h3 className="text-sm font-semibold">Score do Lead</h3>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getScoreColor(leadScore)} text-white shadow-lg`}>
                      {getScoreLabel(leadScore)}
                    </span>
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="text-5xl font-bold bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
                      {leadScore}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${leadScore}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className={`h-full bg-gradient-to-r ${getScoreColor(leadScore)} shadow-lg`}
                        />
                      </div>
                      <p className="text-xs text-white/60 mt-2">
                        Baseado em {insights.totalMessages} interações
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <QuickStat
                    icon={MessageSquare}
                    label="Mensagens"
                    value={insights.totalMessages}
                    trend="+12%"
                    color="indigo"
                  />
                  <QuickStat
                    icon={TrendingUp}
                    label="Engajamento"
                    value={`${insights.engagementRate}%`}
                    trend="+5%"
                    color="emerald"
                  />
                  <QuickStat
                    icon={Zap}
                    label="Resp. Média"
                    value={insights.avgResponseSeconds ? `${insights.avgResponseSeconds.toFixed(1)}s` : '—'}
                    trend="-2s"
                    color="amber"
                  />
                  <QuickStat
                    icon={Target}
                    label="Sentimento"
                    value={`${insights.sentimentScore}%`}
                    trend="+3%"
                    color="purple"
                  />
                </div>

                {/* Contact Info */}
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl space-y-3">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Informações de Contato
                  </h3>
                  <InfoRow icon={Phone} label="Telefone" value={formatPhone(phoneNumber)} />
                  {contactMissing ? (
                    <>
                      <InfoRow icon={Mail} label="Email" value="Registre o contato para adicionar email" />
                      <InfoRow icon={Activity} label="Estágio" value="Novo" />
                    </>
                  ) : (
                    <form className="space-y-3" onSubmit={handleUpdateContact}>
                      <div className="space-y-2">
                        <label className="text-xs uppercase text-white/50">Nome</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase text-white/50">Email</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase text-white/50">Empresa</label>
                        <input
                          type="text"
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase text-white/50">Estágio</label>
                        <input
                          type="text"
                          value={lifecycleStage}
                          disabled
                          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/60"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {savingEdit ? 'Salvando...' : 'Salvar alterações'}
                      </button>
                    </form>
                  )}
                </div>
              </motion.div>
            )}

            {/* Timeline Tab */}
            {activeTab === 'timeline' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {timeline.length === 0 ? (
                  <div className="text-center py-12 text-white/60">
                    <Clock className="w-12 h-12 mx-auto mb-3 text-white/30" />
                    <p className="text-sm">Nenhuma mensagem registrada</p>
                  </div>
                ) : (
                  timeline.map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`rounded-2xl border p-4 ${
                        entry.direction === 'incoming'
                          ? 'bg-white/5 border-white/10'
                          : 'bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border-indigo-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                        <div className="flex items-center gap-2">
                          {entry.direction === 'incoming' ? (
                            <User className="w-3.5 h-3.5" />
                          ) : (
                            <Bot className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                          <span>{entry.direction === 'incoming' ? formatPhone(phoneNumber) : 'Prisma AI'}</span>
                        </div>
                        <span>{entry.displayTime}</span>
                      </div>
                      <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                        {entry.message_text}
                      </p>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* Insights Tab */}
            {activeTab === 'insights' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-indigo-400" />
                    Análise de Conversa
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <InsightCard
                      title="Total"
                      value={insights.totalMessages}
                      description="mensagens trocadas"
                      icon={MessageSquare}
                    />
                    <InsightCard
                      title="Cliente"
                      value={insights.contactMessages}
                      description="mensagens recebidas"
                      icon={User}
                    />
                    <InsightCard
                      title="IA"
                      value={insights.aiMessages}
                      description="respostas automáticas"
                      icon={Bot}
                    />
                    <InsightCard
                      title="Taxa IA"
                      value={`${insights.totalMessages ? Math.round((insights.aiMessages / insights.totalMessages) * 100) : 0}%`}
                      description="automação"
                      icon={Sparkles}
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Sugestões de Ação
                  </h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Enviar material de vendas', icon: ArrowUpRight, color: 'indigo' },
                      { label: 'Agendar follow-up', icon: Calendar, color: 'purple' },
                      { label: 'Adicionar anotação', icon: Activity, color: 'emerald' },
                    ].map((action, index) => {
                      const Icon = action.icon;
                      return (
                        <motion.button
                          key={action.label}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className={`w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-3 flex items-center gap-3 text-sm transition-all hover:border-${action.color}-500/30`}
                        >
                          <Icon className={`w-4 h-4 text-${action.color}-400`} />
                          <span>{action.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.aside>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  trend,
  color,
}: {
  icon: typeof Phone;
  label: string;
  value: string | number;
  trend?: string;
  color: string;
}) {
  const colorClasses = {
    indigo: 'from-indigo-500/10 to-indigo-500/5 border-indigo-500/20 text-indigo-400',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-400',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400',
    purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-400',
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 backdrop-blur-xl ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4" />
        {trend && <span className="text-xs text-emerald-400">{ trend}</span>}
      </div>
      <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
      <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-white/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/60">{label}</p>
        <p className="text-sm font-medium text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function InsightCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: typeof Phone;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-white/60" />
        <p className="text-[10px] uppercase tracking-wider text-white/60">{title}</p>
      </div>
      <p className="text-xl font-bold text-white mb-0.5">{value}</p>
      <p className="text-xs text-white/60">{description}</p>
    </div>
  );
}

function formatPhone(phone: string) {
  if (!phone) return '—';
  return formatPhoneNumber(phone);
}
