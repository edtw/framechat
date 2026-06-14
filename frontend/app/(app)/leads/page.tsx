'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLeadApi } from '@/hooks/useLeadApi';
import { useLeadStore } from '@/stores/leadStore';
import type { Lead, LeadStatus } from '@/stores/leadStore';
import { formatCurrency, formatPhone, formatDate, timeAgo, cn } from '@/lib/utils';
import { extractList } from '@/lib/api-helpers';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  X,
  Phone,
  Mail,
  DollarSign,
  Building,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Hash,
  FileText,
  User,
  Tag,
  Filter,
  Clock,
  ExternalLink,
  MessageCircle,
  Briefcase,
} from 'lucide-react';

/* ──────────────────────────────────────────────
   Pipeline Stages
   Maps store LeadStatus values into 6 display columns
   ────────────────────────────────────────────── */
interface PipelineStage {
  key: string;
  statuses: LeadStatus[];
  label: string;
  subtitle: string;
  color: string;
  collapsed: boolean; // initial collapsed state
}

const PIPELINE: PipelineStage[] = [
  {
    key: 'novos',
    statuses: ['NEW'],
    label: 'Novos',
    subtitle: 'Aguardando primeiro contato',
    color: '#6366F1',
    collapsed: false,
  },
  {
    key: 'em-contato',
    statuses: ['CONTACTED'],
    label: 'Em Contato',
    subtitle: 'Em negociacao inicial',
    color: '#8B5CF6',
    collapsed: false,
  },
  {
    key: 'qualificados',
    statuses: ['QUALIFIED'],
    label: 'Qualificados',
    subtitle: 'Demonstraram interesse',
    color: '#06B6D4',
    collapsed: false,
  },
  {
    key: 'proposta',
    statuses: ['PROPOSAL', 'NEGOTIATION'],
    label: 'Proposta',
    subtitle: 'Proposta enviada ou em negociacao',
    color: '#F59E0B',
    collapsed: false,
  },
  {
    key: 'fechados',
    statuses: ['WON'],
    label: 'Fechados',
    subtitle: 'Negocios convertidos',
    color: '#10B981',
    collapsed: false,
  },
  {
    key: 'perdidos',
    statuses: ['LOST'],
    label: 'Perdidos',
    subtitle: 'Oportunidades nao convertidas',
    color: '#EF4444',
    collapsed: true,
  },
];

/* ──────────────────────────────────────────────
   Priority config
   ────────────────────────────────────────────── */
const PRIORITY: Record<string, { label: string; cls: string }> = {
  LOW: { label: 'Baixa', cls: 'badge-info' },
  MEDIUM: { label: 'Media', cls: 'badge-warning' },
  HIGH: { label: 'Alta', cls: 'badge-error' },
  URGENT: { label: 'Urgente', cls: 'badge-error animate-pulse-glow' },
};

/* ──────────────────────────────────────────────
   Source labels (Portuguese)
   ────────────────────────────────────────────── */
const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  referral: 'Indicacao',
  google: 'Google',
  instagram: 'Instagram',
  facebook: 'Facebook',
  site: 'Site',
  other: 'Outro',
};

/* ──────────────────────────────────────────────
   Date filter options
   ────────────────────────────────────────────── */
type DateFilter = 'all' | 'today' | 'week' | 'month';
const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: '7 dias' },
  { key: 'month', label: '30 dias' },
];

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */
function getDateFilterRange(f: DateFilter): Date | null {
  const now = new Date();
  switch (f) {
    case 'today': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d;
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case 'month': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    default:
      return null;
  }
}

function targetStatusForColumn(col: PipelineStage): LeadStatus {
  return col.statuses[0];
}

/* ── Score helpers ── */
function getScoreValue(lead: Lead): number | null {
  const aiScore = (lead as any).aiScore;
  if (aiScore != null) return Math.round(aiScore);
  if (lead.score != null && lead.score > 0) return lead.score;
  return null;
}

function getScoreColor(score: number) {
  if (score >= 80) return { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400' };
  if (score >= 50) return { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400' };
  if (score >= 30) return { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400' };
  return { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400' };
}

/* ──────────────────────────────────────────────
   Lead Card (inline)
   ────────────────────────────────────────────── */
function LeadCard({
  lead,
  onDragStart,
  onClick,
}: {
  lead: Lead;
  onDragStart: () => void;
  onClick: () => void;
}) {
  const router = useRouter();
  const p = PRIORITY[lead.priority] || { label: lead.priority, cls: 'badge' };

  const handleQuickAction = (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    e.preventDefault();
    switch (action) {
      case 'whatsapp':
        router.push(`/whatsapp?phone=${encodeURIComponent(lead.phone)}`);
        break;
      case 'deal':
        router.push(`/negocios?leadId=${lead.id}`);
        break;
      case 'detail':
        router.push(`/leads/${lead.id}`);
        break;
    }
  };

  return (
    <div
      draggable
      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('text/plain', String(lead.id));
        onDragStart();
      }}
      onClick={onClick}
      className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3.5 cursor-pointer
                 hover:border-emerald-500/20 hover:bg-white/[0.06] transition-all group"
    >
      {/* Header row: name + priority */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-white truncate flex-1">{lead.name}</h4>
        <span className={cn('badge text-[10px] shrink-0', p.cls)}>{p.label}</span>
      </div>

      {/* Company */}
      {lead.company && (
        <div className="flex items-center gap-1.5 mb-1.5 text-xs text-white/40">
          <Building size={11} />
          <span className="truncate">{lead.company}</span>
        </div>
      )}

      {/* Contact info */}
      <div className="flex items-center gap-3 text-xs text-white/40 mb-2">
        {lead.email && (
          <span className="flex items-center gap-1 truncate">
            <Mail size={10} />
            {lead.email}
          </span>
        )}
        {lead.phone && (
          <span className="flex items-center gap-1 shrink-0">
            <Phone size={10} />
            {formatPhone(lead.phone)}
          </span>
        )}
      </div>

      {/* Quick actions — show on hover */}
      <div className="flex items-center gap-1.5 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {lead.phone && (
          <button
            onClick={(e) => handleQuickAction(e, 'whatsapp')}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            title="Enviar WhatsApp"
          >
            <MessageCircle size={10} /> WhatsApp
          </button>
        )}
        <button
          onClick={(e) => handleQuickAction(e, 'deal')}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 hover:bg-amber-500/20 transition-colors"
          title="Criar Negócio"
        >
          <Briefcase size={10} /> Negócio
        </button>
        <button
          onClick={(e) => handleQuickAction(e, 'detail')}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
          title="Ver Detalhes"
        >
          <ExternalLink size={10} /> Detalhes
        </button>
      </div>

      {/* Value + AI Score row */}
      <div className="flex items-center justify-between">
        {lead.value != null && lead.value > 0 ? (
          <span className="text-sm font-semibold text-emerald-400">
            {formatCurrency(lead.value)}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {/* Score badge */}
          {(() => {
            const sv = getScoreValue(lead);
            if (sv === null) {
              return (
                <span
                  className="flex items-center gap-0.5 text-[10px] text-white/20 bg-white/[0.03] border border-white/[0.06] rounded-full px-2 py-0.5 cursor-pointer hover:border-white/15 hover:text-white/40 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    api.post(`/api/crm/leads/${lead.id}/score`).catch(() => {});
                  }}
                  title="Clique para pontuar"
                >
                  <TrendingUp size={9} />
                  {'—'}
                </span>
              );
            }
            const sc = getScoreColor(sv);
            return (
              <span
                className={cn(
                  'flex items-center gap-0.5 text-[10px] rounded-full px-2 py-0.5 border cursor-pointer transition-colors hover:opacity-80',
                  sc.bg,
                  sc.border,
                  sc.text,
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  api.post(`/api/crm/leads/${lead.id}/score`).catch(() => {});
                }}
                title="Clique para re-pontuar"
              >
                <TrendingUp size={9} />
                {sv}
              </span>
            );
          })()}
          {lead.lastContact && (
            <span className="text-[10px] text-white/25 flex items-center gap-0.5">
              <Clock size={9} />
              {timeAgo(lead.lastContact)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Lead Slide Panel (right-side drawer)
   ────────────────────────────────────────────── */
function LeadSlidePanel({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const router = useRouter();
  const p = PRIORITY[lead.priority] || { label: lead.priority, cls: 'badge' };
  const stage = PIPELINE.find((s) => s.statuses.includes(lead.status));

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 330, damping: 38 }}
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#0A0A0F]/98 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl overflow-y-auto"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors z-10"
      >
        <X size={20} />
      </button>

      {/* Header */}
      <div className="px-6 pt-8 pb-4 border-b border-white/[0.06]">
        <h2 className="text-xl font-bold text-white pr-8">{lead.name}</h2>
        {lead.company && (
          <p className="text-sm text-white/40 mt-0.5 flex items-center gap-1.5">
            <Building size={12} />
            {lead.company}
          </p>
        )}
        <div className="flex items-center gap-2 mt-3">
          {stage && (
            <span
              className="badge text-[10px] shrink-0"
              style={{
                backgroundColor: stage.color + '15',
                borderColor: stage.color + '30',
                color: stage.color,
              }}
            >
              {stage.label}
            </span>
          )}
          <span className={cn('badge text-[10px] shrink-0', p.cls)}>{p.label}</span>
          {lead.source && (
            <span className="badge badge-info text-[10px]">
              {SOURCE_LABELS[lead.source] || lead.source}
            </span>
          )}
          {(() => {
            const sv = getScoreValue(lead);
            if (sv === null) return null;
            const sc = getScoreColor(sv);
            return (
              <span
                className={cn(
                  'badge text-[10px] border cursor-pointer hover:opacity-80 transition-opacity',
                  sc.bg,
                  sc.border,
                  sc.text,
                )}
                onClick={() => {
                  api.post(`/api/crm/leads/${lead.id}/score`).catch(() => {});
                }}
                title="Clique para re-pontuar"
              >
                Score {sv}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-4">
        {/* Email */}
        {lead.email && (
          <DetailRow icon={Mail} label="Email" value={lead.email} />
        )}

        {/* Phone */}
        <DetailRow icon={Phone} label="Telefone" value={formatPhone(lead.phone)} />

        {/* CPF */}
        {lead.cpf && <DetailRow icon={Hash} label="CPF" value={lead.cpf} />}

        {/* Value */}
        <DetailRow
          icon={DollarSign}
          label="Valor"
          value={
            lead.value != null && lead.value > 0
              ? formatCurrency(lead.value)
              : '—'
          }
        />

        {/* Description */}
        {lead.description && (
          <DetailRow
            icon={FileText}
            label="Descricao"
            value={lead.description}
            multiline
          />
        )}

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-white/30 mb-2">
              <Tag size={13} />
              <span className="text-xs font-medium">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lead.tags.map((t) => (
                <span
                  key={t.id}
                  className="px-2.5 py-1 rounded-full text-[10px] border text-white/50"
                  style={{
                    backgroundColor: (t.color || '#ffffff10') + '15',
                    borderColor: (t.color || '#ffffff20') + '30',
                  }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="pt-4 mt-2 border-t border-white/[0.06] space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-white/25">
            <Calendar size={11} />
            Criado: {formatDate(lead.createdAt)}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/25">
            <Calendar size={11} />
            Atualizado: {formatDate(lead.updatedAt)}
          </div>
          {lead.lastContact && (
            <div className="flex items-center gap-2 text-xs text-white/25">
              <Clock size={11} />
              Ultimo contato: {timeAgo(lead.lastContact)}
            </div>
          )}
        </div>

        {/* Action: view full */}
        <button
          onClick={() => router.push(`/leads/${lead.id}`)}
          className="btn-secondary w-full mt-4 flex items-center justify-center gap-2"
        >
          <ExternalLink size={14} />
          Ver lead completo
        </button>
      </div>
    </motion.div>
  );
}

/* Helper for slide panel rows */
function DetailRow({
  icon: Icon,
  label,
  value,
  multiline,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-white/30 mb-1">
        <Icon size={12} />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p
        className={cn(
          'text-sm text-white/80',
          multiline && 'whitespace-pre-wrap leading-relaxed'
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Create Lead Modal
   ────────────────────────────────────────────── */
function CreateLeadModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { createLead } = useLeadApi();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [value, setValue] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setValue('');
    setSource('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await createLead({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        company: company.trim() || undefined,
        value: value ? parseFloat(value) : undefined,
        source: source || undefined,
      } as Partial<Lead>);
      reset();
      onCreated();
      onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.error || 'Erro ao criar lead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Novo Lead</h2>
              <button
                onClick={onClose}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {err && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-sm text-red-400 mb-4">
                {err}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                placeholder="Nome *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                />
                <input
                  placeholder="Telefone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Empresa"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="input-field"
                />
                <input
                  placeholder="Valor (R$)"
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="input-field"
                />
              </div>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="input-field"
              >
                <option value="">Origem (opcional)</option>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Criando...' : 'Criar Lead'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────
   Main Page Component
   ────────────────────────────────────────────── */
function LeadsPage() {
  const searchParams = useSearchParams();
  const { fetchLeads, updateLeadStatus } = useLeadApi();
  const { leads, setLeads, loading, setLoading, setError, error } = useLeadStore();

  // ── UI State ──────────────────────────────
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(searchParams.get('action') === 'new');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [scoreSort, setScoreSort] = useState<'none' | 'desc' | 'asc'>('none');

  // ── Filters ──────────────────────────────
  const [activeStatusFilters, setActiveStatusFilters] = useState<Set<string>>(new Set());
  const [activeSourceFilters, setActiveSourceFilters] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // ── Collapsed columns ────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(PIPELINE.filter((s) => s.collapsed).map((s) => s.key))
  );

  // ── Data Loading ─────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLeads({ search: search || undefined, limit: 200 });
      setLeads(extractList(data, 'leads') as Lead[]);
    } catch {
      setError('Erro ao carregar leads.');
    } finally {
      setLoading(false);
    }
  }, [fetchLeads, setLeads, setLoading, setError, search]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Derived: filtered leads ──────────────
  const filteredLeads = useMemo(() => {
    let filtered = leads;

    // Text search (client-side secondary filter)
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.email && l.email.toLowerCase().includes(q)) ||
          l.phone.includes(q) ||
          (l.company && l.company.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (activeStatusFilters.size > 0) {
      filtered = filtered.filter((l) => activeStatusFilters.has(l.status));
    }

    // Source filter
    if (activeSourceFilters.size > 0) {
      filtered = filtered.filter((l) => activeSourceFilters.has(l.source || 'other'));
    }

    // Date filter
    const rangeStart = getDateFilterRange(dateFilter);
    if (rangeStart) {
      filtered = filtered.filter((l) => new Date(l.createdAt) >= rangeStart);
    }

    // Score sort
    if (scoreSort !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        const sa = getScoreValue(a) ?? -1;
        const sb = getScoreValue(b) ?? -1;
        return scoreSort === 'desc' ? sb - sa : sa - sb;
      });
    }

    return filtered;
  }, [leads, search, activeStatusFilters, activeSourceFilters, dateFilter, scoreSort]);

  // ── Derived: group by pipeline column ────
  const columnLeads = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    PIPELINE.forEach((col) => {
      map[col.key] = [];
    });
    filteredLeads.forEach((l) => {
      const col = PIPELINE.find((c) => c.statuses.includes(l.status));
      if (col) {
        map[col.key].push(l);
      }
    });
    return map;
  }, [filteredLeads]);

  // ── Status filter options ────────────────
  const statusFilterOptions = useMemo(() => {
    const statuses = new Set(leads.map((l) => l.status));
    return PIPELINE.filter((col) =>
      col.statuses.some((s) => statuses.has(s))
    );
  }, [leads]);

  // ── Source filter options ────────────────
  const sourceFilterOptions = useMemo(() => {
    const sources = new Set(leads.map((l) => l.source || 'other'));
    return Array.from(sources).filter(Boolean);
  }, [leads]);

  // ── Handlers ─────────────────────────────
  const toggleStatusFilter = (status: LeadStatus) => {
    setActiveStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleSourceFilter = (source: string) => {
    setActiveSourceFilters((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const toggleColumnCollapse = (colKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  };

  const clearAllFilters = () => {
    setActiveStatusFilters(new Set());
    setActiveSourceFilters(new Set());
    setDateFilter('all');
    setSearch('');
    setScoreSort('none');
  };

  const hasActiveFilters =
    activeStatusFilters.size > 0 ||
    activeSourceFilters.size > 0 ||
    dateFilter !== 'all' ||
    search.trim() !== '';

  // ── Drag & Drop ──────────────────────────
  const handleDrop = useCallback(
    async (col: PipelineStage, leadId: number) => {
      const newStatus = targetStatusForColumn(col);
      const store = useLeadStore.getState();

      // Optimistic update
      store.updateLeadStatus(leadId, newStatus);

      try {
        await updateLeadStatus(leadId, newStatus);
      } catch {
        // Rollback on failure
        load();
      }
      setDraggingId(null);
    },
    [updateLeadStatus, load]
  );

  // ── Render ───────────────────────────────
  return (
    
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col h-full"
      >
        {/* ═══════ TOP BAR ═══════ */}
        <div className="px-6 pt-6 pb-3 space-y-3">
          {/* Title + actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Pipeline de Leads</h1>
              <p className="text-sm text-white/40 mt-0.5">
                {draggingId != null
                  ? 'Solte o lead na coluna desejada...'
                  : `${filteredLeads.length} de ${leads.length} leads${filteredLeads.length !== leads.length ? ' (filtrados)' : ''}`
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                />
                <input
                  placeholder="Buscar leads..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field pl-9 py-2 text-xs w-48 sm:w-56"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                onClick={() => setModalOpen(true)}
                className="btn-primary flex items-center gap-2 shrink-0"
              >
                <Plus size={16} />
                Novo Lead
              </button>
            </div>
          </div>

          {/* Filter chips row */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={12} className="text-white/25 shrink-0" />

            {/* Date filter chips */}
            {DATE_FILTERS.map((df) => (
              <button
                key={df.key}
                onClick={() => setDateFilter(df.key)}
                className={cn(
                  'px-3 py-1 rounded-full text-[11px] font-medium border transition-all',
                  dateFilter === df.key
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60 hover:border-white/15'
                )}
              >
                {df.label}
              </button>
            ))}

            <span className="w-px h-4 bg-white/10 mx-1" />

            {/* Status filter chips */}
            {statusFilterOptions.map((col) => (
              <button
                key={col.key}
                onClick={() => toggleStatusFilter(col.statuses[0])}
                className={cn(
                  'px-3 py-1 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1.5',
                  activeStatusFilters.has(col.statuses[0])
                    ? 'border-white/25 text-white'
                    : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60 hover:border-white/15'
                )}
                style={
                  activeStatusFilters.has(col.statuses[0])
                    ? { backgroundColor: col.color + '20', borderColor: col.color + '40', color: col.color }
                    : undefined
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: col.color }}
                />
                {col.label}
              </button>
            ))}

            {/* Source filter chips (only if there are sources) */}
            {sourceFilterOptions.length > 1 && (
              <>
                <span className="w-px h-4 bg-white/10 mx-1" />
                {sourceFilterOptions.slice(0, 4).map((src) => (
                  <button
                    key={src}
                    onClick={() => toggleSourceFilter(src)}
                    className={cn(
                      'px-3 py-1 rounded-full text-[11px] font-medium border transition-all',
                      activeSourceFilters.has(src)
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                        : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60 hover:border-white/15'
                    )}
                  >
                    {SOURCE_LABELS[src] || src}
                  </button>
                ))}
              </>
            )}

            {/* Score sort toggle */}
            <span className="w-px h-4 bg-white/10 mx-1" />
            <button
              onClick={() => setScoreSort((prev) => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none')}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1.5',
                scoreSort !== 'none'
                  ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                  : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60 hover:border-white/15'
              )}
              title="Ordenar por score"
            >
              <TrendingUp size={11} />
              Score
              {scoreSort === 'desc' ? ' ↓' : scoreSort === 'asc' ? ' ↑' : ''}
            </button>

            {/* Clear all filters */}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="px-2.5 py-1 rounded-full text-[10px] text-red-400/70 hover:text-red-400 border border-red-500/15 hover:border-red-500/30 transition-all flex items-center gap-1"
              >
                <X size={10} />
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* ═══════ ERROR BANNER ═══════ */}
        {error && (
          <div className="mx-6 mb-3 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* ═══════ KANBAN BOARD ═══════ */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mb-4">
              <User size={28} className="text-white/15" />
            </div>
            <p className="text-white/40 text-sm">Nenhum lead encontrado.</p>
            <p className="text-white/20 text-xs mt-1 mb-4">
              Crie seu primeiro lead para comecar o pipeline.
            </p>
            <button onClick={() => setModalOpen(true)} className="btn-primary">
              Criar Primeiro Lead
            </button>
          </div>
        ) : (
          <div className="flex-1 px-6 pb-6 overflow-hidden">
            <div className="flex gap-3 h-full overflow-x-auto pb-2 scrollbar-thin">
              {PIPELINE.map((col) => {
                const items = columnLeads[col.key] || [];
                const isCollapsed = collapsed.has(col.key);
                const isEmpty = items.length === 0;

                return (
                  <div
                    key={col.key}
                    className={cn(
                      'flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.015] transition-all',
                      isCollapsed ? 'w-[52px] min-w-[52px]' : 'w-72 min-w-[18rem]',
                      draggingId != null && 'border-white/[0.12]'
                    )}
                    onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('border-emerald-500/30');
                    }}
                    onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
                      e.currentTarget.classList.remove('border-emerald-500/30');
                    }}
                    onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-emerald-500/30');
                      const raw = e.dataTransfer.getData('text/plain');
                      const leadId = parseInt(raw);
                      if (leadId) handleDrop(col, leadId);
                    }}
                  >
                    {/* Column header */}
                    <div
                      className={cn(
                        'flex items-center px-3 py-3 border-b border-white/[0.05]',
                        isCollapsed ? 'flex-col justify-between flex-1' : 'justify-between'
                      )}
                    >
                      {isCollapsed ? (
                        /* Collapsed state */
                        <div className="flex flex-col items-center gap-3 flex-1 justify-center">
                          <button
                            onClick={() => toggleColumnCollapse(col.key)}
                            className="text-white/30 hover:text-white/60 transition-colors"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: col.color }}
                          />
                          <span
                            className="text-[10px] font-medium text-white/50 uppercase tracking-wider"
                            style={{ writingMode: 'vertical-lr' }}
                          >
                            {col.label}
                          </span>
                          <span className="text-[11px] font-semibold text-white/30">
                            {items.length}
                          </span>
                          <button
                            onClick={() => toggleColumnCollapse(col.key)}
                            className="text-white/30 hover:text-white/60 transition-colors"
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                      ) : (
                        /* Expanded state */
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              onClick={() => toggleColumnCollapse(col.key)}
                              className="text-white/25 hover:text-white/50 transition-colors shrink-0"
                              title="Collapse column"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: col.color }}
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-white uppercase tracking-wider">
                                {col.label}
                              </span>
                              <p className="text-[10px] text-white/25 truncate">
                                {col.subtitle}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full font-medium shrink-0">
                            {items.length}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Column body (only when expanded) */}
                    {!isCollapsed && (
                      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px]">
                        <AnimatePresence mode="popLayout">
                          {items.map((lead) => (
                            <motion.div
                              key={lead.id}
                              layout
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.25 }}
                            >
                              <LeadCard
                                lead={lead}
                                onDragStart={() => setDraggingId(lead.id)}
                                onClick={() => setSelectedLead(lead)}
                              />
                            </motion.div>
                          ))}
                        </AnimatePresence>

                        {isEmpty && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center justify-center py-10 text-center"
                          >
                            <p className="text-xs text-white/10 italic">
                              Nenhum lead nesta etapa
                            </p>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════ MODALS & PANELS ═══════ */}

        {/* Create modal */}
        <CreateLeadModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={load}
        />

        {/* Slide-out detail panel */}
        <AnimatePresence>
          {selectedLead && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
                onClick={() => setSelectedLead(null)}
              />
              <LeadSlidePanel
                lead={selectedLead}
                onClose={() => setSelectedLead(null)}
              />
            </>
          )}
        </AnimatePresence>
      </motion.div>
    
  );
}

export default function LeadsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-[#0A0A0F]"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LeadsPage />
    </Suspense>
  );
}
