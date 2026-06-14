'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { extractList } from '@/lib/api-helpers';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  Plus,
  Search,
  DollarSign,
  TrendingUp,
  Calendar,
  User,
  Building,
  AlertCircle,
  Loader2,
  Check,
  X,
  Link as LinkIcon,
  Copy,
  Pencil,
  Trash2,
  ExternalLink,
  MousePointerClick,
  UserPlus,
  Percent,
  CheckCircle,
  XCircle,
} from 'lucide-react';

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

interface LeadOption {
  id: number;
  name: string;
  company?: string;
}

interface Deal {
  id: number;
  title: string;
  value?: number;
  status: 'OPEN' | 'WON' | 'LOST';
  leadName?: string;
  lead?: { name: string };
  leadId?: number;
  company?: string;
  expectedCloseDate?: string;
  createdAt: string;
  notes?: string;
}

interface AffiliateLink {
  id: string;
  name: string;
  url: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  shortCode?: string | null;
  clicks: number;
  signups: number;
  conversions: number;
  isActive: boolean;
  operator?: { id: number; name: string };
  createdAt: string;
  updatedAt: string;
}

interface AffiliateAggregate {
  totalClicks: number;
  totalSignups: number;
  totalConversions: number;
}

/* ──────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────── */

const statusConfig: Record<string, { label: string; cls: string; icon: typeof Check }> = {
  OPEN: { label: 'Em Aberto', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/20', icon: TrendingUp },
  WON: { label: 'Ganho', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20', icon: Check },
  LOST: { label: 'Perdido', cls: 'bg-red-500/15 text-red-300 border-red-500/20', icon: X },
};

const UTM_SOURCES = ['instagram', 'facebook', 'whatsapp', 'telegram', 'tiktok', 'youtube', 'google', 'email', 'blog', 'direct'];
const UTM_MEDIUMS = ['social', 'bio', 'story', 'post', 'reel', 'dm', 'cpc', 'email', 'banner', 'qr_code'];
const UTM_CAMPAIGNS = ['revolut_standard', 'revolut_premium', 'revolut_metal', 'revolut_pro', 'revolut_bonus', 'revolut_launch', 'revolut_q1', 'revolut_q2', 'promo_summer', 'promo_winter', 'promo_referral', 'promo_cashback'];

function generateShortCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function buildFullUrl(url: string, utmSource?: string | null, utmMedium?: string | null, utmCampaign?: string | null): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (utmSource) u.searchParams.set('utm_source', utmSource);
    if (utmMedium) u.searchParams.set('utm_medium', utmMedium);
    if (utmCampaign) u.searchParams.set('utm_campaign', utmCampaign);
    return u.toString();
  } catch {
    return url;
  }
}

function truncateUrl(url: string, max = 40): string {
  return url.length > max ? url.slice(0, max) + '...' : url;
}

/* ──────────────────────────────────────────────
   Toast
   ────────────────────────────────────────────── */

function Toast({ message, show }: { message: string; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="fixed bottom-6 right-6 z-[100] bg-emerald-500/90 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-lg shadow-emerald-500/30 backdrop-blur-sm"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────
   Affiliate Link Modal (Create / Edit)
   ────────────────────────────────────────────── */

function AffiliateLinkModal({
  open,
  onClose,
  onSaved,
  editLink,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editLink?: AffiliateLink | null;
}) {
  const isEdit = !!editLink;

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (editLink) {
      setName(editLink.name);
      setUrl(editLink.url);
      setUtmSource(editLink.utmSource || '');
      setUtmMedium(editLink.utmMedium || '');
      setUtmCampaign(editLink.utmCampaign || '');
      setShortCode(editLink.shortCode || '');
    } else {
      setName('');
      setUrl('');
      setUtmSource('');
      setUtmMedium('');
      setUtmCampaign('');
      setShortCode(generateShortCode());
    }
  }, [editLink, open]);

  const fullUrl = buildFullUrl(url, utmSource || null, utmMedium || null, utmCampaign || null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      if (isEdit && editLink) {
        await api.put(`/api/affiliates/links/${editLink.id}`, {
          name: name.trim(),
          url: url.trim(),
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          shortCode: shortCode || null,
        });
      } else {
        await api.post('/api/affiliates/links', {
          name: name.trim(),
          url: url.trim(),
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          shortCode: shortCode || null,
        });
      }
      onSaved();
      onClose();
    } catch (ex: unknown) {
      const err = ex as { response?: { data?: { error?: string } } };
      setErr(err?.response?.data?.error || 'Erro ao salvar link.');
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
            className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                {isEdit ? 'Editar Link de Afiliado' : 'Novo Link de Afiliado'}
              </h2>
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
              {/* Name */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Nome do Link *</label>
                <input
                  placeholder="Ex: Link Bio Instagram"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              {/* URL */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">URL de Afiliado Revolut *</label>
                <input
                  placeholder="https://revolut.com/referral/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              {/* UTM Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">UTM Source</label>
                  <select
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Nenhum</option>
                    {UTM_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">UTM Medium</label>
                  <select
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Nenhum</option>
                    {UTM_MEDIUMS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">UTM Campaign</label>
                  <select
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Nenhum</option>
                    {UTM_CAMPAIGNS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Short Code */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Código Curto</label>
                <div className="flex gap-2">
                  <input
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value)}
                    className="input-field font-mono"
                    placeholder="Auto-gerado"
                  />
                  <button
                    type="button"
                    onClick={() => setShortCode(generateShortCode())}
                    className="btn-secondary shrink-0"
                  >
                    Gerar
                  </button>
                </div>
                <p className="text-[11px] text-white/30 mt-1">
                  Usado para rastreamento: /api/affiliates/{shortCode || '...'}/click
                </p>
              </div>

              {/* Preview */}
              {(url || utmSource || utmMedium || utmCampaign) && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <label className="block text-xs text-white/40 mb-1">Pré-visualizacão da URL</label>
                  <p className="text-xs text-emerald-400/80 font-mono break-all">{fullUrl || '—'}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Salvando...' : isEdit ? 'Salvar Alteracões' : 'Criar Link'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────
   Confirm Delete Modal
   ────────────────────────────────────────────── */

function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  linkName,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  linkName: string;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
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
            className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-white mb-2">Excluir Link</h2>
            <p className="text-sm text-white/60 mb-5">
              Tem certeza que deseja excluir <strong className="text-white">{linkName}</strong>? Esta acão não pode ser desfeita.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="btn-secondary">Cancelar</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-danger flex items-center gap-2"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────
   New Deal Modal
   ────────────────────────────────────────────── */

function NewDealModal({
  open,
  onClose,
  onCreated,
  leads,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  leads: LeadOption[];
}) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [leadId, setLeadId] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setValue('');
    setLeadId('');
    setExpectedCloseDate('');
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await api.post('/api/crm/deals', {
        title: title.trim(),
        value: value ? parseFloat(value) : undefined,
        leadId: leadId ? parseInt(leadId) : undefined,
        expectedCloseDate: expectedCloseDate || undefined,
        notes: notes.trim() || undefined,
      });
      reset();
      onCreated();
      onClose();
    } catch (ex: unknown) {
      const err = ex as { response?: { data?: { error?: string } } };
      setErr(err?.response?.data?.error || 'Erro ao criar negócio.');
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
              <h2 className="text-lg font-semibold text-white">Novo Negócio</h2>
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
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Título *</label>
                <input
                  placeholder="Ex: Venda Premium Revolut"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Valor (R$)</label>
                  <input
                    placeholder="5000"
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Previsão Fechamento</label>
                  <input
                    type="date"
                    value={expectedCloseDate}
                    onChange={(e) => setExpectedCloseDate(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1.5">Lead Relacionado</label>
                <select
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  className="input-field"
                >
                  <option value="">Nenhum (opcional)</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.name}{lead.company ? ` — ${lead.company}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1.5">Observações</label>
                <textarea
                  placeholder="Detalhes do negócio..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="input-field"
                />
              </div>

              <button type="submit" disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Criando...' : 'Criar Negócio'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────
   Main Page
   ────────────────────────────────────────────── */

export default function NegociosPage() {
  /* ---------- Deals state ---------- */
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [errorDeals, setErrorDeals] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dealModalOpen, setDealModalOpen] = useState(false);

  /* ---------- Affiliate links state ---------- */
  const [affLinks, setAffLinks] = useState<AffiliateLink[]>([]);
  const [affAgg, setAffAgg] = useState<AffiliateAggregate>({ totalClicks: 0, totalSignups: 0, totalConversions: 0 });
  const [loadingAff, setLoadingAff] = useState(true);
  const [errorAff, setErrorAff] = useState<string | null>(null);
  const [affModalOpen, setAffModalOpen] = useState(false);
  const [editAffLink, setEditAffLink] = useState<AffiliateLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AffiliateLink | null>(null);

  /* ---------- Toast ---------- */
  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2500);
  };

  /* ---------- Deals loader ---------- */
  const loadDeals = useCallback(async () => {
    setLoadingDeals(true);
    setErrorDeals(null);
    try {
      const [{ data: dealsData }, { data: leadsData }] = await Promise.all([
        api.get('/api/crm/deals', {
          params: {
            search: search || undefined,
            status: statusFilter !== 'ALL' ? statusFilter : undefined,
          },
        }),
        api.get('/api/crm/leads', { params: { limit: 200 } }),
      ]);
      setDeals(extractList(dealsData, 'deals') as Deal[]);
      const leadsList = extractList(leadsData) as LeadOption[];
      setLeads(leadsList);
    } catch {
      setErrorDeals('Erro ao carregar negócios.');
    } finally {
      setLoadingDeals(false);
    }
  }, [search, statusFilter]);

  /* ---------- Affiliate links loader ---------- */
  const loadAffLinks = useCallback(async () => {
    setLoadingAff(true);
    setErrorAff(null);
    try {
      const { data } = await api.get('/api/affiliates/links');
      const links = extractList(data, 'data') as AffiliateLink[];
      setAffLinks(links);
      if (data?.aggregateTotals) {
        setAffAgg(data.aggregateTotals as AffiliateAggregate);
      }
    } catch {
      setErrorAff('Erro ao carregar links de afiliado.');
    } finally {
      setLoadingAff(false);
    }
  }, []);

  useEffect(() => {
    loadDeals();
    loadAffLinks();
  }, [loadDeals, loadAffLinks]);

  /* ---------- Affiliate link actions ---------- */
  const handleCopyUrl = async (link: AffiliateLink) => {
    const copyUrl = buildFullUrl(link.url, link.utmSource, link.utmMedium, link.utmCampaign);
    try {
      await navigator.clipboard.writeText(copyUrl);
      showToast('Link copiado!');
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = copyUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Link copiado!');
    }
  };

  const handleEditLink = (link: AffiliateLink) => {
    setEditAffLink(link);
    setAffModalOpen(true);
  };

  const handleDeleteLink = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/affiliates/links/${deleteTarget.id}`);
      setDeleteTarget(null);
      showToast('Link excluído.');
      loadAffLinks();
    } catch {
      showToast('Erro ao excluir link.');
    }
  };

  const handleAffSaved = () => {
    setEditAffLink(null);
    loadAffLinks();
  };

  /* ---------- Deals derived ---------- */
  const totalValue = deals
    .filter(d => d.status === 'WON')
    .reduce((sum, d) => sum + (d.value || 0), 0);

  const openValue = deals
    .filter(d => d.status === 'OPEN')
    .reduce((sum, d) => sum + (d.value || 0), 0);

  const winRate = deals.length > 0
    ? Math.round((deals.filter(d => d.status === 'WON').length / deals.length) * 100)
    : 0;

  const filtered = deals.filter(d => {
    if (search && !d.title?.toLowerCase().includes(search.toLowerCase()) &&
        !d.leadName?.toLowerCase().includes(search.toLowerCase()) &&
        !d.company?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  /* ---------- Affiliate derived ---------- */
  const affConvRate = affAgg.totalClicks > 0
    ? ((affAgg.totalConversions / affAgg.totalClicks) * 100).toFixed(1)
    : '0.0';

  const filters = [
    { key: 'ALL', label: 'Todos' },
    { key: 'OPEN', label: 'Em Aberto' },
    { key: 'WON', label: 'Ganhos' },
    { key: 'LOST', label: 'Perdidos' },
  ];

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">

        {/* ================================================================
            SECTION 1: Links de Afiliado
            ================================================================ */}
        <div>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Negócios</h1>
              <p className="text-sm text-white/40 mt-0.5">Pipeline de negócios, deals e links de afiliado</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditAffLink(null); setAffModalOpen(true); }}
                className="btn-secondary flex items-center gap-2"
              >
                <LinkIcon size={16} /> Gerar Novo Link
              </button>
              <button onClick={() => setDealModalOpen(true)} className="btn-primary flex items-center gap-2">
                <Plus size={16} /> Novo Negócio
              </button>
            </div>
          </div>

          {/* Affiliate Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <MousePointerClick size={16} className="text-blue-400" />
                <span className="text-xs text-white/40">Total de Cliques</span>
              </div>
              <p className="text-2xl font-bold text-white">{affAgg.totalClicks.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus size={16} className="text-purple-400" />
                <span className="text-xs text-white/40">Total de Cadastros</span>
              </div>
              <p className="text-2xl font-bold text-white">{affAgg.totalSignups.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Percent size={16} className="text-emerald-400" />
                <span className="text-xs text-white/40">Taxa de Conversão</span>
              </div>
              <p className="text-2xl font-bold text-white">{affConvRate}%</p>
            </div>
          </div>

          {/* Affiliate Error */}
          {errorAff && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 mb-4">
              <AlertCircle size={16} /> {errorAff}
            </div>
          )}

          {/* Affiliate Links Table */}
          {loadingAff ? (
            <div className="space-y-3 mb-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-white/[0.02] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : affLinks.length === 0 ? (
            <div className="text-center py-12 border border-white/[0.06] rounded-2xl bg-white/[0.01] mb-4">
              <LinkIcon size={40} className="text-white/10 mx-auto mb-3" />
              <p className="text-white/40 mb-3">Nenhum link de afiliado criado.</p>
              <button
                onClick={() => { setEditAffLink(null); setAffModalOpen(true); }}
                className="btn-secondary text-xs"
              >
                Criar Primeiro Link
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.01] mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left">
                    <th className="px-4 py-3 text-xs font-medium text-white/40">Nome</th>
                    <th className="px-4 py-3 text-xs font-medium text-white/40">URL</th>
                    <th className="px-4 py-3 text-xs font-medium text-white/40 whitespace-nowrap">UTM Tags</th>
                    <th className="px-4 py-3 text-xs font-medium text-white/40 text-right">Cliques</th>
                    <th className="px-4 py-3 text-xs font-medium text-white/40 text-right">Cadastros</th>
                    <th className="px-4 py-3 text-xs font-medium text-white/40 text-right whitespace-nowrap">Conv. Rate</th>
                    <th className="px-4 py-3 text-xs font-medium text-white/40">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-white/40 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {affLinks.map((link) => {
                    const rate = link.clicks > 0
                      ? ((link.conversions / link.clicks) * 100).toFixed(1)
                      : '0.0';
                    const fullUrl = buildFullUrl(link.url, link.utmSource, link.utmMedium, link.utmCampaign);
                    const utmTags = [link.utmSource, link.utmMedium, link.utmCampaign]
                      .filter(Boolean)
                      .join(' / ') || '—';

                    return (
                      <tr
                        key={link.id}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{link.name}</p>
                          {link.shortCode && (
                            <p className="text-[11px] text-white/30 font-mono">{link.shortCode}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400/70 hover:text-emerald-400 font-mono text-xs break-all inline-flex items-center gap-1"
                            title={fullUrl}
                          >
                            {truncateUrl(fullUrl)}
                            <ExternalLink size={10} className="shrink-0" />
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-white/50 text-xs">{utmTags}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">{link.clicks.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">{link.signups.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">{rate}%</td>
                        <td className="px-4 py-3">
                          {link.isActive ? (
                            <span className="badge badge-success">
                              <CheckCircle size={10} /> Ativo
                            </span>
                          ) : (
                            <span className="badge badge-error">
                              <XCircle size={10} /> Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleCopyUrl(link)}
                              className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                              title="Copiar URL"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={() => handleEditLink(link)}
                              className="p-1.5 rounded-lg text-white/30 hover:text-blue-400 hover:bg-white/10 transition-colors"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(link)}
                              className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/10 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ================================================================
            Divider
            ================================================================ */}
        <div className="border-t border-white/[0.06]" />

        {/* ================================================================
            SECTION 2: Negócios / Deals (existing)
            ================================================================ */}
        <div>
          {/* Section Header */}
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={18} className="text-white/40" />
            <h2 className="text-lg font-semibold text-white">Pipeline de Negócios</h2>
          </div>

          {/* Deals Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={16} className="text-emerald-400" />
                <span className="text-xs text-white/40">Total Ganho</span>
              </div>
              <p className="text-2xl font-bold text-white">{formatCurrency(totalValue)}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Briefcase size={16} className="text-amber-400" />
                <span className="text-xs text-white/40">Pipeline Aberto</span>
              </div>
              <p className="text-2xl font-bold text-white">{formatCurrency(openValue)}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-purple-400" />
                <span className="text-xs text-white/40">Taxa de Conversão</span>
              </div>
              <p className="text-2xl font-bold text-white">{winRate}%</p>
            </div>
          </div>

          {/* Deals Error */}
          {errorDeals && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 mb-4">
              <AlertCircle size={16} /> {errorDeals}
            </div>
          )}

          {/* Deals Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                placeholder="Buscar negócios..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="flex gap-2">
              {filters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-xs font-medium transition-colors',
                    statusFilter === f.key
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-white/5 text-white/50 border border-white/10 hover:text-white'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Deals List */}
          {loadingDeals ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-white/[0.02] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Briefcase size={40} className="text-white/10 mx-auto mb-3" />
              <p className="text-white/40">Nenhum negócio encontrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(deal => {
                const status = statusConfig[deal.status] || statusConfig.OPEN;
                const StatusIcon = status.icon;
                return (
                  <div
                    key={deal.id}
                    className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium mb-2">{deal.title}</h3>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
                          {deal.leadName && (
                            <span className="flex items-center gap-1"><User size={12} /> {deal.leadName}</span>
                          )}
                          {deal.company && (
                            <span className="flex items-center gap-1"><Building size={12} /> {deal.company}</span>
                          )}
                          {deal.expectedCloseDate && (
                            <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(deal.expectedCloseDate)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {deal.value != null && deal.value > 0 && (
                          <span className="text-sm font-semibold text-emerald-400">{formatCurrency(deal.value)}</span>
                        )}
                        <span className={cn('text-[10px] px-2.5 py-1 rounded-full border font-medium flex items-center gap-1', status.cls)}>
                          <StatusIcon size={10} />
                          {status.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ================================================================
            Modals
            ================================================================ */}

        {/* Affiliate Link Modal (Create / Edit) */}
        <AffiliateLinkModal
          open={affModalOpen}
          onClose={() => { setAffModalOpen(false); setEditAffLink(null); }}
          onSaved={handleAffSaved}
          editLink={editAffLink}
        />

        {/* Confirm Delete Modal */}
        <ConfirmDeleteModal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteLink}
          linkName={deleteTarget?.name || ''}
        />

        {/* New Deal Modal */}
        <NewDealModal
          open={dealModalOpen}
          onClose={() => setDealModalOpen(false)}
          onCreated={loadDeals}
          leads={leads}
        />

        {/* Toast */}
        <Toast message={toastMsg} show={toastShow} />
      </motion.div>
    
  );
}
