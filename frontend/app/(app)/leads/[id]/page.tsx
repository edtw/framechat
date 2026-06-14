'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLeadApi } from '@/hooks/useLeadApi';
import type { Lead, LeadStatus } from '@/stores/leadStore';
import { formatCurrency, formatDate, formatPhone, cn } from '@/lib/utils';
import api from '@/lib/api';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building,
  Calendar,
  User,
  FileText,
  Clock,
  DollarSign,
  QrCode,
  CreditCard,
  MessageCircle,
  Edit,
  Check,
  X,
  Save,
  Loader2,
  ChevronDown,
  Briefcase,
  CheckSquare,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Novo', CONTACTED: 'Em Contato', QUALIFIED: 'Qualificado',
  PROPOSAL: 'Proposta', NEGOTIATION: 'Negociação', WON: 'Ganho', LOST: 'Perdido',
};

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'NEW', label: 'Novo', color: '#6366F1' },
  { value: 'CONTACTED', label: 'Em Contato', color: '#8B5CF6' },
  { value: 'QUALIFIED', label: 'Qualificado', color: '#06B6D4' },
  { value: 'PROPOSAL', label: 'Proposta', color: '#F59E0B' },
  { value: 'NEGOTIATION', label: 'Negociação', color: '#F97316' },
  { value: 'WON', label: 'Ganho', color: '#10B981' },
  { value: 'LOST', label: 'Perdido', color: '#EF4444' },
];

const PRIORITY_LABELS: Record<string, { label: string; cls: string }> = {
  LOW: { label: 'Baixa', cls: 'badge badge-info' },
  MEDIUM: { label: 'Média', cls: 'badge badge-warning' },
  HIGH: { label: 'Alta', cls: 'badge badge-error' },
  URGENT: { label: 'Urgente', cls: 'badge badge-error' },
};

/* ──────────────────────────────────────────────
   Main Detail Page
   ────────────────────────────────────────────── */
export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const { fetchLeadById, updateLeadStatus } = useLeadApi();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'followups' | 'pix' | 'virtualcards'>('overview');

  // Notes
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Status change
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  // Follow-up state
  const [sequences, setSequences] = useState<any[]>([]);
  const [followUpTasks, setFollowUpTasks] = useState<any[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLeadById(id);
      const loaded = data.lead || data;
      setLead(loaded);
      setNotes(loaded.notes || loaded.description || '');
    } catch {
      setError('Erro ao carregar lead.');
    } finally {
      setLoading(false);
    }
  }, [id, fetchLeadById]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead) return;
    setChangingStatus(true);
    try {
      await updateLeadStatus(lead.id, newStatus);
      setLead({ ...lead, status: newStatus });
      setShowStatusDropdown(false);
    } catch {
      // silent
    } finally {
      setChangingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!lead) return;
    setSavingNotes(true);
    try {
      await api.patch(`/api/crm/leads/${lead.id}`, { description: notes });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch {
      // silent
    } finally {
      setSavingNotes(false);
    }
  };

  // ── Follow-up data loading ──────────────
  const loadFollowUpData = useCallback(async () => {
    if (!id) return;
    setLoadingFollowUps(true);
    setFollowUpError(null);
    try {
      const [seqRes, taskRes] = await Promise.all([
        api.get('/api/followups/sequences', { params: { isActive: true } }),
        api.get('/api/followups/tasks', { params: { leadId: id } }),
      ]);
      setSequences(seqRes.data.data || []);
      setFollowUpTasks(taskRes.data.data || []);
    } catch {
      setFollowUpError('Erro ao carregar dados de follow-up.');
    } finally {
      setLoadingFollowUps(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'followups') {
      loadFollowUpData();
    }
  }, [activeTab, loadFollowUpData]);

  const handleEnroll = async () => {
    if (!selectedSequenceId) return;
    setEnrolling(true);
    try {
      await api.post(`/api/followups/sequences/${selectedSequenceId}/enroll/${id}`);
      setSelectedSequenceId('');
      await loadFollowUpData();
    } catch {
      // silent
    } finally {
      setEnrolling(false);
    }
  };

  const handleSkipTask = async (taskId: string) => {
    try {
      await api.post(`/api/followups/tasks/${taskId}/skip`);
      await loadFollowUpData();
    } catch {
      // silent
    }
  };

  const priority = lead ? (PRIORITY_LABELS[lead.priority] || { label: lead.priority, cls: 'badge' }) : null;
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === lead?.status);

  const tabs = [
    { key: 'overview' as const, label: 'Visão Geral' },
    { key: 'timeline' as const, label: 'Timeline' },
    { key: 'followups' as const, label: 'Follow-ups' },
    { key: 'pix' as const, label: 'PIX' },
    { key: 'virtualcards' as const, label: 'Cartões' },
  ];

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5 max-w-5xl p-4 sm:p-6 lg:p-8">
        {/* Back */}
        <button onClick={() => router.push('/leads')} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Voltar para Leads
        </button>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {lead && (
          <>
            {/* Header Card */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">{lead.name}</h1>
                  {lead.company && <p className="text-sm text-white/40 mt-0.5">{lead.company}</p>}
                </div>

                {/* Status + Priority badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      disabled={changingStatus}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                      style={{
                        backgroundColor: (currentStatus?.color || '#6366F1') + '20',
                        borderColor: (currentStatus?.color || '#6366F1') + '40',
                        color: currentStatus?.color || '#6366F1',
                      }}
                    >
                      {changingStatus ? <Loader2 size={12} className="animate-spin" /> : null}
                      {STATUS_LABELS[lead.status] || lead.status}
                      <ChevronDown size={12} />
                    </button>
                    {showStatusDropdown && (
                      <div className="absolute top-full mt-1 left-0 z-50 bg-[#1A1A24] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[180px]">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleStatusChange(opt.value)}
                            className={cn(
                              'w-full text-left px-4 py-2 text-xs hover:bg-white/[0.04] transition-colors flex items-center gap-2',
                              opt.value === lead.status ? 'font-semibold' : ''
                            )}
                            style={{ color: opt.color }}
                          >
                            {opt.value === lead.status && <Check size={12} />}
                            <span className={opt.value !== lead.status ? 'ml-5' : ''}>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {priority && <span className={cn('text-xs', priority.cls)}>{priority.label}</span>}
                  {lead.value != null && lead.value > 0 && (
                    <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
                      {formatCurrency(lead.value)}
                    </span>
                  )}
                  {lead.score != null && lead.score > 0 && (
                    <span className="text-xs bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-full font-medium">
                      Score: {lead.score}%
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-white/[0.06]">
                <button
                  onClick={() => router.push(`/whatsapp?phone=${lead.phone}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                >
                  <MessageCircle size={13} /> WhatsApp
                </button>
                <button
                  onClick={() => router.push(`/negocios?leadId=${lead.id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                >
                  <Briefcase size={13} /> Criar Negócio
                </button>
                <button
                  onClick={() => router.push(`/tarefas?leadId=${lead.id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/20 transition-colors"
                >
                  <CheckSquare size={13} /> Criar Tarefa
                </button>
                <button
                  onClick={() => router.push('/pix/generate')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors"
                >
                  <QrCode size={13} /> Gerar PIX
                </button>
                <button
                  onClick={() => router.push('/conhecimento')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 text-xs font-medium hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                >
                  <BookOpen size={13} /> Base de Conhecimento
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-2xl p-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'px-4 py-2 text-sm rounded-xl transition-all whitespace-nowrap',
                    activeTab === tab.key
                      ? 'bg-emerald-500 text-white font-medium'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl p-6">
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoItem icon={Mail} label="Email" value={lead.email || 'Não informado'} />
                    <InfoItem icon={Phone} label="Telefone" value={lead.phone ? formatPhone(lead.phone) : 'Não informado'} />
                    <InfoItem icon={Building} label="Empresa" value={lead.company || 'Não informado'} />
                    <InfoItem icon={DollarSign} label="Valor" value={lead.value ? formatCurrency(lead.value) : 'Não definido'} />
                    <InfoItem icon={Calendar} label="Criado em" value={formatDate(lead.createdAt)} />
                    <InfoItem icon={Clock} label="Atualizado" value={formatDate(lead.updatedAt)} />
                    {lead.source && <InfoItem icon={User} label="Origem" value={lead.source} />}
                    {lead.score != null && <InfoItem icon={FileText} label="Score AI" value={`${lead.score}%`} />}
                    {lead.lastContact && <InfoItem icon={Clock} label="Último Contato" value={formatDate(lead.lastContact)} />}
                  </div>
                  {lead.description && (
                    <div>
                      <h3 className="text-sm font-medium text-white/60 mb-2">Descrição</h3>
                      <p className="text-sm text-white/70 bg-white/[0.03] rounded-xl p-4 border border-white/5 whitespace-pre-wrap">{lead.description}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'timeline' && <EmptyTab icon={Clock} message="Nenhum evento registrado." />}
              {activeTab === 'followups' && (
                <div className="space-y-5">
                  {/* ── Enroll section ── */}
                  <div>
                    <h3 className="text-sm font-medium text-white/60 mb-3">Sequências de Follow-up</h3>
                    {loadingFollowUps ? (
                      <div className="flex items-center gap-2 text-sm text-white/30 py-4">
                        <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        Carregando...
                      </div>
                    ) : followUpError ? (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{followUpError}</div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <select
                          value={selectedSequenceId}
                          onChange={(e) => setSelectedSequenceId(e.target.value)}
                          className="input-field flex-1"
                          disabled={sequences.length === 0}
                        >
                          <option value="">
                            {sequences.length === 0
                              ? 'Nenhuma sequência disponível'
                              : 'Selecionar sequência...'}
                          </option>
                          {sequences.map((seq: any) => (
                            <option key={seq.id} value={seq.id}>
                              {seq.name}
                              {seq.description ? ` — ${seq.description}` : ''}
                              {' '}
                              ({seq.steps?.length || 0} passos)
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleEnroll}
                          disabled={!selectedSequenceId || enrolling}
                          className="btn-primary flex items-center gap-1.5 text-xs px-4 py-2 shrink-0"
                        >
                          {enrolling ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Inscrevendo...
                            </>
                          ) : (
                            'Inscrever'
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Tasks list ── */}
                  <div>
                    <h3 className="text-sm font-medium text-white/60 mb-3">
                      Tarefas Agendadas
                      {followUpTasks.length > 0 && (
                        <span className="ml-2 text-xs text-white/30 font-normal">
                          ({followUpTasks.length})
                        </span>
                      )}
                    </h3>

                    {loadingFollowUps ? (
                      <div className="flex items-center gap-2 text-sm text-white/30 py-4">
                        <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        Carregando...
                      </div>
                    ) : followUpTasks.length === 0 ? (
                      <div className="text-center py-8">
                        <Calendar size={28} className="text-white/15 mx-auto mb-2" />
                        <p className="text-sm text-white/30">Nenhum follow-up agendado.</p>
                        <p className="text-xs text-white/15 mt-1">
                          Inscreva o lead em uma sequência acima para agendar tarefas.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {followUpTasks.map((task: any) => (
                          <div
                            key={task.id}
                            className={cn(
                              'flex items-center gap-3 p-3.5 rounded-xl border transition-all',
                              task.status === 'PENDING'
                                ? 'bg-white/[0.02] border-white/[0.06]'
                                : 'bg-white/[0.01] border-white/[0.04]'
                            )}
                          >
                            {/* Status indicator */}
                            <span
                              className={cn(
                                'text-sm shrink-0',
                                task.status === 'PENDING' && 'text-yellow-400',
                                task.status === 'SENT' && 'text-emerald-400',
                                task.status === 'SKIPPED' && 'text-white/25',
                                task.status === 'FAILED' && 'text-red-400',
                              )}
                              title={
                                task.status === 'PENDING' ? 'Pendente' :
                                task.status === 'SENT' ? 'Enviado' :
                                task.status === 'SKIPPED' ? 'Pulado' :
                                task.status === 'FAILED' ? 'Falhou' :
                                task.status
                              }
                            >
                              {task.status === 'PENDING' && '⏳'}
                              {task.status === 'SENT' && '✅'}
                              {task.status === 'SKIPPED' && '⏭️'}
                              {task.status === 'FAILED' && '❌'}
                              {!['PENDING', 'SENT', 'SKIPPED', 'FAILED'].includes(task.status) && '⏳'}
                            </span>

                            {/* Task info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-white truncate">
                                  {task.sequence?.name || 'Sequência'} — Passo {task.stepIndex + 1}
                                </span>
                                <span
                                  className={cn(
                                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                                    task.status === 'PENDING' && 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
                                    task.status === 'SENT' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                                    task.status === 'SKIPPED' && 'bg-white/[0.03] text-white/30 border border-white/[0.06]',
                                    task.status === 'FAILED' && 'bg-red-500/10 text-red-400 border border-red-500/20',
                                  )}
                                >
                                  {task.status === 'PENDING' && 'Pendente'}
                                  {task.status === 'SENT' && 'Enviado'}
                                  {task.status === 'SKIPPED' && 'Pulado'}
                                  {task.status === 'FAILED' && 'Falhou'}
                                  {!['PENDING', 'SENT', 'SKIPPED', 'FAILED'].includes(task.status) && task.status}
                                </span>
                              </div>
                              <p className="text-xs text-white/25 mt-0.5">
                                Agendado para {formatDate(task.scheduledAt)}
                                {task.sentAt && ` — Enviado ${formatDate(task.sentAt)}`}
                              </p>
                            </div>

                            {/* Skip button (only for pending) */}
                            {task.status === 'PENDING' && (
                              <button
                                onClick={() => handleSkipTask(task.id)}
                                className="text-[10px] px-2.5 py-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] transition-all shrink-0"
                                title="Pular esta tarefa"
                              >
                                Pular
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activeTab === 'pix' && (
                <div className="text-center py-10">
                  <QrCode size={32} className="text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/40">Nenhuma transação PIX para este lead.</p>
                  <button onClick={() => router.push('/pix/generate')} className="btn-primary mt-3 text-xs">Gerar PIX</button>
                </div>
              )}
              {activeTab === 'virtualcards' && <EmptyTab icon={CreditCard} message="Nenhum cartão virtual vinculado." />}
            </div>

            {/* Notes Section */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Edit size={16} className="text-white/40" />
                  <h3 className="text-sm font-medium text-white/60">Anotações</h3>
                </div>
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
                >
                  {savingNotes ? <Loader2 size={12} className="animate-spin" /> : notesSaved ? <Check size={12} /> : <Save size={12} />}
                  {savingNotes ? 'Salvando...' : notesSaved ? 'Salvo!' : 'Salvar'}
                </button>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione suas anotações sobre este lead..."
                className="input-field min-h-[100px] resize-y"
              />
            </div>
          </>
        )}
      </motion.div>
    
  );
}

/* ──────────────────────────────────────────────
   Helper Components
   ────────────────────────────────────────────── */
function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
      <Icon size={16} className="text-white/30 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-white/40">{label}</p>
        <p className="text-sm text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptyTab({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="text-center py-10">
      <Icon size={32} className="text-white/20 mx-auto mb-3" />
      <p className="text-sm text-white/40">{message}</p>
    </div>
  );
}
