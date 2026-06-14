'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import api from '@/lib/api';
import { extractList } from '@/lib/api-helpers';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  RefreshCw,
  Filter,
  Calendar,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  Target,
  UserCheck,
  PieChart,
  Layers,
  BarChart3,
  Receipt,
  PlusCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

// ==================== TYPES ====================

interface FunnelStage {
  stage: string;
  count: number;
  pct: number;
  conversionFromPrev?: number;
}

interface FunnelData {
  stages: FunnelStage[];
  avgTimeInStage: Record<string, string>;
  totalLeads: number;
  conversionRate: number;
  revenueGenerated: number;
}

interface RevenueData {
  total: number;
  pending: number;
  confirmed: number;
  paid: number;
  byMonth: Record<string, number>[];
  byType: Record<string, number>[];
  topLeads: TopLead[];
}

interface TopLead {
  id: number;
  name: string;
  totalCommission: number;
}

interface CommissionStats {
  total: number;
  totalAmount: number;
  byStatusSummary: { pending: number; confirmed: number; paid: number };
  byStatus: { status: string; count: number; total: number }[];
  byType: { type: string; count: number; total: number }[];
}

interface MonthlyTrend {
  month: string;
  total: number;
  count: number;
  pending: number;
  confirmed: number;
  paid: number;
}

interface Commission {
  id: number;
  operatorId: number;
  leadId: number | null;
  amount: string | number;
  currency: string;
  type: string;
  status: string;
  description: string | null;
  sourceRef?: string | null;
  createdAt: string;
  confirmedAt: string | null;
  paidAt: string | null;
  operator?: { id: number; name: string; email: string };
  lead?: { id: number; name: string; email: string; status: string; phone?: string };
}

interface Lead {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  status: string;
  score?: number;
  aiScore?: number;
  createdAt: string;
  updatedAt: string;
  lastContact?: string;
  value?: number;
  priority?: string;
}

interface EnrichedTopLead {
  id: number;
  name: string;
  score: number;
  stage: string;
  revenue: number;
  lastContact: string;
}

// ==================== CONSTANTS ====================

const STAGE_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  EM_CONTATO: 'Em Contato',
  QUALIFICADO: 'Qualificado',
  PROPOSTA: 'Proposta',
  FECHADO: 'Fechado',
  PERDIDO: 'Perdido',
};

const TYPE_LABELS: Record<string, string> = {
  SIGNUP_BONUS: 'Bônus de Cadastro',
  TRANSACTION_PCT: '% de Transação',
  PREMIUM_UPGRADE: 'Upgrade Premium',
  REFERRAL_BONUS: 'Bônus de Indicação',
  OTHER: 'Outro',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos os Status' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'CONFIRMED', label: 'Confirmada' },
  { value: 'PAID', label: 'Paga' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const CHART_COLORS: Record<string, string> = {
  NOVO: '#3B82F6',
  EM_CONTATO: '#F59E0B',
  QUALIFICADO: '#8B5CF6',
  PROPOSTA: '#EC4899',
  FECHADO: '#10B981',
  PERDIDO: '#EF4444',
  confirmed: '#10B981',
  pending: '#F59E0B',
  paid: '#3B82F6',
  SIGNUP_BONUS: '#10B981',
  TRANSACTION_PCT: '#3B82F6',
  PREMIUM_UPGRADE: '#8B5CF6',
  REFERRAL_BONUS: '#F59E0B',
  OTHER: '#6B7280',
};

const DONUT_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#6B7280'];

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fev',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'Mai',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Set',
  '10': 'Out',
  '11': 'Nov',
  '12': 'Dez',
};

// ==================== HELPERS ====================

function getData<T>(response: any): T | null {
  try {
    const body = response?.data;
    if (body?.success && body?.data !== undefined && body?.data !== null) {
      return body.data as T;
    }
    if (body && !body.success && body.data !== undefined) {
      return body.data as T;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeByMonth(byMonth: Record<string, number>[]): { month: string; amount: number }[] {
  return byMonth
    .map((item) => {
      const keys = Object.keys(item);
      return { month: keys[0] || '', amount: item[keys[0]] || 0 };
    })
    .filter((x) => x.month);
}

function normalizeByType(
  byType: Record<string, number>[]
): { type: string; amount: number }[] {
  return byType
    .map((item) => {
      const keys = Object.keys(item);
      return { type: keys[0] || '', amount: item[keys[0]] || 0 };
    })
    .filter((x) => x.type && x.amount > 0);
}

function formatMonth(monthKey: string): string {
  if (!monthKey) return '';
  const parts = monthKey.split('-');
  if (parts.length === 2) {
    return MONTH_LABELS[parts[1]] || monthKey;
  }
  return monthKey;
}

function parseAmount(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ==================== SKELETONS ====================

function StatCardSkeleton() {
  return (
    <div className="rounded-[20px] border border-white/5 bg-white/[0.03] p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-white/[0.05]" />
        <div className="w-12 h-5 rounded-full bg-white/[0.05]" />
      </div>
      <div className="h-8 w-24 bg-white/[0.05] rounded-lg mb-2" />
      <div className="h-3 w-32 bg-white/[0.05] rounded" />
    </div>
  );
}

function ChartSkeleton({ height = 'h-72' }: { height?: string }) {
  return (
    <div className={cn('rounded-3xl bg-white/[0.03] border border-white/5 animate-pulse', height)}>
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-white/10 animate-spin" />
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-white/[0.05]" />
          <div className="h-4 flex-1 bg-white/[0.05] rounded" />
          <div className="h-4 w-20 bg-white/[0.05] rounded" />
          <div className="h-4 w-16 bg-white/[0.05] rounded" />
          <div className="h-4 w-24 bg-white/[0.05] rounded" />
        </div>
      ))}
    </div>
  );
}

function FullPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <ChartSkeleton height="h-80" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6">
          <div className="h-5 w-36 bg-white/[0.05] rounded-lg mb-4" />
          <ChartSkeleton height="h-48" />
        </div>
        <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6">
          <div className="h-5 w-36 bg-white/[0.05] rounded-lg mb-4" />
          <TableSkeleton rows={5} />
        </div>
      </div>
      <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6">
        <div className="h-5 w-36 bg-white/[0.05] rounded-lg mb-4" />
        <ChartSkeleton height="h-56" />
      </div>
      <div className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6">
        <div className="h-5 w-36 bg-white/[0.05] rounded-lg mb-4" />
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}

// ==================== EMPTY STATES ====================

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
        <Icon size={24} className="text-white/20" />
      </div>
      <p className="text-sm font-medium text-white/60 mb-1">{title}</p>
      <p className="text-xs text-white/30 max-w-sm mb-4">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" icon={PlusCircle} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

// ==================== SECTION ERROR ====================

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <AlertCircle size={20} className="text-red-400/60 mb-2" />
      <p className="text-xs text-white/40 mb-3">Erro ao carregar dados desta seção</p>
      <Button variant="ghost" size="sm" icon={RefreshCw} onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}

// ==================== STAT CARD ====================

function StatCard({
  label,
  value,
  change,
  changeLabel,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  change?: { value: string; isPositive: boolean } | null;
  changeLabel?: string;
  icon: React.ElementType;
  color: 'emerald' | 'blue' | 'amber' | 'purple';
}) {
  const colorMap = {
    emerald: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: 'text-emerald-400',
    },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: 'text-blue-400' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: 'text-amber-400' },
    purple: {
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      icon: 'text-purple-400',
    },
  };
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-white/5 bg-white/[0.03] p-5 hover:border-white/10 transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center', c.bg, c.border)}>
          <Icon size={18} className={c.icon} />
        </div>
        {change && (
          <span
            className={cn(
              'text-[11px] font-medium flex items-center gap-0.5 px-2 py-0.5 rounded-full',
              change.isPositive ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
            )}
          >
            {change.isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {change.value}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-xs text-white/40 mt-1">
        {label}
        {changeLabel && <span className="text-white/25 ml-1">· {changeLabel}</span>}
      </p>
    </motion.div>
  );
}

// ==================== REVENUE LINE CHART ====================

function RevenueLineChart({ monthlyTrends }: { monthlyTrends: MonthlyTrend[] }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return <ChartSkeleton height="h-80" />;
  }

  if (monthlyTrends.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nenhum dado de receita"
        description="Os dados de receita mensal aparecerão aqui quando houver comissões registradas."
      />
    );
  }

  const chartData = monthlyTrends.map((t) => ({
    name: formatMonth(t.month),
    month: t.month,
    Confirmado: t.paid,
    Pendente: t.pending,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl p-3 shadow-2xl">
        <p className="text-xs font-medium text-white mb-2">{label}</p>
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-white/60">{entry.name}:</span>
            <span className="text-white font-medium tabular-nums">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
          tickFormatter={(v: number) =>
            new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
              notation: 'compact',
            }).format(v)
          }
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, opacity: 0.7 }}
          iconType="circle"
          iconSize={8}
        />
        <Line
          type="monotone"
          dataKey="Confirmado"
          stroke="#10B981"
          strokeWidth={2.5}
          dot={{ fill: '#10B981', r: 4, strokeWidth: 2, stroke: '#0A0A0F' }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="Pendente"
          stroke="#F59E0B"
          strokeWidth={2.5}
          strokeDasharray="5 5"
          dot={{ fill: '#F59E0B', r: 4, strokeWidth: 2, stroke: '#0A0A0F' }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ==================== COMMISSION DONUT CHART ====================

function CommissionDonutChart({
  byType,
}: {
  byType: { type: string; count: number; total: number }[];
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return <ChartSkeleton height="h-48" />;
  }

  if (byType.length === 0 || byType.every((t) => t.total === 0)) {
    return (
      <EmptyState
        icon={PieChart}
        title="Nenhuma comissão"
        description="Os tipos de comissão aparecerão aqui quando houver dados registrados."
      />
    );
  }

  const chartData = byType.map((t) => ({
    name: TYPE_LABELS[t.type] || t.type,
    value: t.total,
    count: t.count,
    type: t.type,
  }));

  const totalValue = chartData.reduce((sum, d) => sum + d.value, 0);

  const CustomLabel = ({ cx, cy }: any) => {
    return (
      <>
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fill="white"
          fontSize={18}
          fontWeight={700}
        >
          {new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            notation: 'compact',
          }).format(totalValue)}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize={11}
        >
          Total
        </text>
      </>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RePieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={entry.type}
              fill={CHART_COLORS[entry.type] || DONUT_COLORS[index % DONUT_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }: any) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="rounded-xl border border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl p-3 shadow-2xl">
                <p className="text-xs font-medium text-white mb-1">{d.name}</p>
                <p className="text-xs text-white/60">
                  {d.count} comissões · {formatCurrency(d.value)}
                </p>
              </div>
            );
          }}
        />
        {CustomLabel({ cx: '50%', cy: '50%' })}
      </RePieChart>
    </ResponsiveContainer>
  );
}

// ==================== COMMISSION BREAKDOWN TABLE ====================

function CommissionBreakdownTable({
  commissions,
  loading,
}: {
  commissions: Commission[];
  loading: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const filtered = useMemo(() => {
    let result = [...commissions];

    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (dateStart) {
      const start = new Date(dateStart);
      start.setHours(0, 0, 0, 0);
      result = result.filter((c) => new Date(c.createdAt) >= start);
    }

    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      result = result.filter((c) => new Date(c.createdAt) <= end);
    }

    result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return result;
  }, [commissions, statusFilter, dateStart, dateEnd]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, dateStart, dateEnd]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'success' as const;
      case 'CONFIRMED':
        return 'info' as const;
      case 'PENDING':
        return 'warning' as const;
      case 'CANCELLED':
        return 'error' as const;
      default:
        return 'info' as const;
    }
  };

  if (loading) {
    return <TableSkeleton rows={5} />;
  }

  if (commissions.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhuma comissão registrada"
        description="Registre sua primeira comissão para começar a acompanhar as receitas do programa de afiliados."
        actionLabel="Registrar primeira comissão"
        onAction={() => {
          // Navigate or trigger modal — for now, scroll to top
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2">
          <Filter size={12} className="text-white/30" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-xs text-white/70 outline-none cursor-pointer appearance-none pr-1"
          >
            {STATUS_FILTERS.map((sf) => (
              <option key={sf.value} value={sf.value} className="bg-[#0A0A0F] text-white">
                {sf.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={12} className="text-white/30" />
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-emerald-500/40 transition-colors"
            style={{ colorScheme: 'dark' }}
          />
          <span className="text-white/20 text-xs">até</span>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-emerald-500/40 transition-colors"
            style={{ colorScheme: 'dark' }}
          />
        </div>
        {(statusFilter !== 'all' || dateStart || dateEnd) && (
          <button
            onClick={() => {
              setStatusFilter('all');
              setDateStart('');
              setDateEnd('');
            }}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {pageData.length === 0 ? (
        <div className="text-center py-8 text-xs text-white/40">
          Nenhuma comissão encontrada com esses filtros.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Lead
                  </th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="text-center py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-3 text-xs text-white/50 tabular-nums">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-white/80 text-sm">
                        {c.lead?.name || `Lead #${c.leadId || '—'}`}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-white/50">
                        {TYPE_LABELS[c.type] || c.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-white text-sm font-medium tabular-nums">
                        {formatCurrency(parseAmount(c.amount))}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={getStatusBadgeVariant(c.status)}>
                        {STATUS_LABELS[c.status] || c.status}
                      </Badge>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
              <p className="text-xs text-white/30">
                {filtered.length} comissões · página {page + 1} de {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown size={14} className="rotate-90" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  // Show pages around current page
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i;
                  } else if (page < 2) {
                    pageNum = i;
                  } else if (page > totalPages - 3) {
                    pageNum = totalPages - 5 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        'w-7 h-7 rounded-lg text-xs font-medium transition-colors',
                        pageNum === page
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'text-white/40 hover:text-white hover:bg-white/[0.05]'
                      )}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown size={14} className="-rotate-90" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== FUNNEL BAR CHART ====================

function FunnelBarChart({
  stages,
  avgTimeInStage,
  conversionRate,
  totalLeads,
  revenueGenerated,
}: {
  stages: FunnelStage[];
  avgTimeInStage: Record<string, string>;
  conversionRate: number;
  totalLeads: number;
  revenueGenerated: number;
}) {
  if (stages.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Dados insuficientes para o funil"
        description="Adicione leads ao pipeline para visualizar o funil de conversão."
      />
    );
  }

  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const activeStages = stages.filter((s) => s.stage !== 'PERDIDO');

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-white/50 bg-white/[0.02] rounded-xl px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Target size={13} className="text-white/40" />
          <span className="text-white/70 font-medium">{totalLeads}</span> leads
        </div>
        <span className="text-white/20 hidden sm:inline">|</span>
        <div className="flex items-center gap-1.5">
          <TrendingUp size={13} className="text-emerald-400" />
          <span className="text-emerald-400 font-medium">{conversionRate}%</span> conversão
        </div>
        <span className="text-white/20 hidden sm:inline">|</span>
        <div className="flex items-center gap-1.5">
          <DollarSign size={13} className="text-amber-400" />
          <span className="text-amber-400 font-medium">
            {formatCurrency(revenueGenerated)}
          </span>{' '}
          receita
        </div>
      </div>

      {/* Funnel bars */}
      <div className="space-y-2">
        {stages.map((stage, i) => {
          const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
          const prevCount = i > 0 ? stages[i - 1].count : stage.count;
          const dropOff =
            i > 0 && prevCount > 0
              ? Math.round(((prevCount - stage.count) / prevCount) * 100)
              : 0;
          const isActive = stage.stage !== 'PERDIDO';
          const timeInStage = avgTimeInStage[stage.stage];
          const stageColor = CHART_COLORS[stage.stage] || '#6B7280';

          return (
            <div key={stage.stage} className="group">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-medium text-white/60 w-24 text-right shrink-0">
                  {STAGE_LABELS[stage.stage] || stage.stage}
                </span>
                <div className="relative flex-1 h-8 bg-white/[0.03] rounded-lg overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                    className="h-full rounded-lg flex items-center px-2.5"
                    style={{
                      background: isActive
                        ? `linear-gradient(90deg, ${stageColor}99, ${stageColor}CC)`
                        : `linear-gradient(90deg, #EF444466, #EF444488)`,
                    }}
                  >
                    <span className="text-xs font-bold text-white">{stage.count}</span>
                  </motion.div>
                  {timeInStage && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/40 opacity-0 group-hover:opacity-100 transition-opacity bg-[#0A0A0F]/80 px-1.5 py-0.5 rounded">
                      {timeInStage}
                    </span>
                  )}
                </div>
                {i > 0 && dropOff > 0 && (
                  <span className="text-[10px] text-red-400/70 w-12 shrink-0 text-left tabular-nums">
                    -{dropOff}%
                  </span>
                )}
                {i > 0 && dropOff <= 0 && <span className="w-12 shrink-0" />}
                {i === 0 && <span className="w-12 shrink-0" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend for avg time */}
      {Object.keys(avgTimeInStage).length > 0 && (
        <div className="flex flex-wrap gap-3 text-[10px] text-white/30 mt-3 pt-3 border-t border-white/[0.05]">
          {Object.entries(avgTimeInStage)
            .filter(([, v]) => v)
            .map(([stage, time]) => (
              <span key={stage} className="flex items-center gap-1">
                <span className="text-white/50 font-medium">
                  {STAGE_LABELS[stage] || stage}:
                </span>
                {time}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// ==================== TOP LEADS TABLE ====================

function TopLeadsTable({ topLeads }: { topLeads: EnrichedTopLead[] }) {
  const [sortField, setSortField] = useState<string>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...topLeads].sort((a, b) => {
      let aVal: any = a[sortField as keyof EnrichedTopLead];
      let bVal: any = b[sortField as keyof EnrichedTopLead];

      if (sortField === 'lastContact') {
        aVal = new Date(a.lastContact || 0).getTime();
        bVal = new Date(b.lastContact || 0).getTime();
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [topLeads, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp size={12} className="inline ml-0.5" />
    ) : (
      <ChevronDown size={12} className="inline ml-0.5" />
    );
  };

  if (topLeads.length === 0) {
    return (
      <EmptyState
        icon={UserCheck}
        title="Nenhum lead com receita"
        description="Os leads que gerarem comissões aparecerão aqui, ordenados por receita gerada."
      />
    );
  }

  const getStageBadgeVariant = (stage: string) => {
    switch (stage) {
      case 'WON':
        return 'success' as const;
      case 'LOST':
        return 'error' as const;
      case 'PROPOSAL':
      case 'NEGOTIATION':
        return 'purple' as const;
      case 'QUALIFIED':
        return 'info' as const;
      default:
        return 'warning' as const;
    }
  };

  const stageLabel = (s: string) => {
    const map: Record<string, string> = {
      NEW: 'Novo',
      CONTACTED: 'Em Contato',
      QUALIFIED: 'Qualificado',
      PROPOSAL: 'Proposta',
      NEGOTIATION: 'Negociação',
      WON: 'Fechado',
      LOST: 'Perdido',
    };
    return map[s] || s;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="text-left py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider">
              Lead
            </th>
            <th
              onClick={() => handleSort('score')}
              className="text-center py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/70 transition-colors select-none"
            >
              Score <SortIcon field="score" />
            </th>
            <th
              onClick={() => handleSort('stage')}
              className="text-center py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/70 transition-colors select-none"
            >
              Estágio <SortIcon field="stage" />
            </th>
            <th
              onClick={() => handleSort('revenue')}
              className="text-right py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/70 transition-colors select-none"
            >
              Receita Gerada <SortIcon field="revenue" />
            </th>
            <th
              onClick={() => handleSort('lastContact')}
              className="text-right py-2.5 px-3 text-xs font-medium text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/70 transition-colors select-none hidden sm:table-cell"
            >
              Último Contato <SortIcon field="lastContact" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((lead, i) => (
            <motion.tr
              key={lead.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
            >
              <td className="py-3 px-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                    {lead.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white text-sm font-medium">{lead.name}</span>
                </div>
              </td>
              <td className="text-center py-3 px-3">
                <span
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    lead.score >= 70
                      ? 'text-emerald-400'
                      : lead.score >= 40
                        ? 'text-amber-400'
                        : 'text-white/50'
                  )}
                >
                  {lead.score || '—'}
                </span>
              </td>
              <td className="text-center py-3 px-3">
                <Badge variant={getStageBadgeVariant(lead.stage)}>
                  {stageLabel(lead.stage)}
                </Badge>
              </td>
              <td className="text-right py-3 px-3">
                <span className="text-white font-medium tabular-nums">
                  {formatCurrency(lead.revenue)}
                </span>
              </td>
              <td className="text-right py-3 px-3 text-white/40 text-xs tabular-nums hidden sm:table-cell">
                {lead.lastContact ? formatDate(lead.lastContact) : '—'}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function RelatoriosPage() {
  // ── Data state ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [commissionStats, setCommissionStats] = useState<CommissionStats | null>(null);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  // ── Load all data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        funnelRes,
        revenueRes,
        statsRes,
        trendsRes,
        commissionsRes,
        leadsRes,
      ] = await Promise.allSettled([
        api.get('/api/analytics/funnel'),
        api.get('/api/analytics/revenue'),
        api.get('/api/crm/commissions/stats'),
        api.get('/api/crm/commissions/monthly-trends'),
        api.get('/api/crm/commissions', { params: { limit: 200 } }),
        api.get('/api/crm/leads', { params: { limit: 500 } }),
      ]);

      // Funnel
      if (funnelRes.status === 'fulfilled') {
        const data = getData<FunnelData>(funnelRes.value);
        if (data) setFunnelData(data);
      }

      // Revenue
      if (revenueRes.status === 'fulfilled') {
        const data = getData<RevenueData>(revenueRes.value);
        if (data) setRevenueData(data);
      }

      // Commission Stats
      if (statsRes.status === 'fulfilled') {
        const data = getData<CommissionStats>(statsRes.value);
        if (data) setCommissionStats(data);
      }

      // Monthly Trends
      if (trendsRes.status === 'fulfilled') {
        const data = getData<MonthlyTrend[]>(trendsRes.value);
        if (data && Array.isArray(data)) setMonthlyTrends(data);
      }

      // Commissions list
      if (commissionsRes.status === 'fulfilled') {
        const raw = commissionsRes.value?.data;
        const list = extractList(raw);
        setCommissions(list as Commission[]);

        // If we got a list but stats/total are empty, synthesize basic stats
        if (list.length > 0 && statsRes.status !== 'fulfilled') {
          const pendingAmount = list
            .filter((c: any) => c.status === 'PENDING')
            .reduce((s: number, c: any) => s + parseAmount(c.amount), 0);
          const confirmedAmount = list
            .filter((c: any) => c.status === 'CONFIRMED')
            .reduce((s: number, c: any) => s + parseAmount(c.amount), 0);
          const paidAmount = list
            .filter((c: any) => c.status === 'PAID')
            .reduce((s: number, c: any) => s + parseAmount(c.amount), 0);
          const totalAmount = pendingAmount + confirmedAmount + paidAmount;

          const byTypeMap: Record<string, { count: number; total: number }> = {};
          for (const c of list as Commission[]) {
            const t = c.type || 'OTHER';
            if (!byTypeMap[t]) byTypeMap[t] = { count: 0, total: 0 };
            byTypeMap[t].count++;
            byTypeMap[t].total += parseAmount(c.amount);
          }

          const byStatusMap: Record<string, { count: number; total: number }> = {};
          for (const c of list as Commission[]) {
            const s = c.status || 'PENDING';
            if (!byStatusMap[s]) byStatusMap[s] = { count: 0, total: 0 };
            byStatusMap[s].count++;
            byStatusMap[s].total += parseAmount(c.amount);
          }

          setCommissionStats({
            total: list.length,
            totalAmount: totalAmount,
            byStatusSummary: {
              pending: pendingAmount,
              confirmed: confirmedAmount,
              paid: paidAmount,
            },
            byStatus: Object.entries(byStatusMap).map(([status, data]) => ({
              status,
              ...data,
            })),
            byType: Object.entries(byTypeMap).map(([type, data]) => ({
              type,
              ...data,
            })),
          });

          // Synthesize monthly trends
          const monthMap: Record<
            string,
            { total: number; count: number; pending: number; confirmed: number; paid: number }
          > = {};
          for (const c of list as Commission[]) {
            const m = (c.createdAt || '').slice(0, 7);
            if (!m) continue;
            if (!monthMap[m])
              monthMap[m] = { total: 0, count: 0, pending: 0, confirmed: 0, paid: 0 };
            const amt = parseAmount(c.amount);
            monthMap[m].total += amt;
            monthMap[m].count += 1;
            if (c.status === 'PENDING') monthMap[m].pending += amt;
            if (c.status === 'CONFIRMED') monthMap[m].confirmed += amt;
            if (c.status === 'PAID') monthMap[m].paid += amt;
          }
          const trends = Object.entries(monthMap)
            .map(([month, data]) => ({ month, ...data }))
            .sort((a, b) => a.month.localeCompare(b.month));
          if (trends.length > 0) setMonthlyTrends(trends);
        }
      }

      // Leads
      if (leadsRes.status === 'fulfilled') {
        const list = extractList(leadsRes.value?.data);
        setLeads(list as Lead[]);
      }
    } catch {
      setError('Não foi possível carregar os dados dos relatórios. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Derived data ──

  const monthlyChange = useMemo(() => {
    if (monthlyTrends.length < 2) return null;
    const current = monthlyTrends[monthlyTrends.length - 1];
    const previous = monthlyTrends[monthlyTrends.length - 2];
    if (!previous.total || previous.total === 0) {
      if (current.total > 0) return { value: '+100%', isPositive: true };
      return null;
    }
    const pctChange = ((current.total - previous.total) / previous.total) * 100;
    if (Math.abs(pctChange) < 0.5) return null;
    return {
      value: `${pctChange > 0 ? '+' : ''}${Math.round(pctChange)}%`,
      isPositive: pctChange >= 0,
    };
  }, [monthlyTrends]);

  const confirmedCount = useMemo(() => {
    if (commissionStats?.byStatus) {
      const confirmed = commissionStats.byStatus.find((s) => s.status === 'CONFIRMED');
      return confirmed?.count || 0;
    }
    return 0;
  }, [commissionStats]);

  const donutData = useMemo(() => {
    return commissionStats?.byType || [];
  }, [commissionStats]);

  const enrichedTopLeads: EnrichedTopLead[] = useMemo(() => {
    if (!revenueData?.topLeads?.length) {
      // Fall back to leads with value
      return leads
        .filter((l) => l.value && l.value > 0)
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, 10)
        .map((l) => ({
          id: l.id,
          name: l.name,
          score: l.aiScore || l.score || 0,
          stage: l.status || 'NEW',
          revenue: l.value || 0,
          lastContact: l.lastContact || l.updatedAt || '',
        }));
    }

    return revenueData.topLeads
      .map((tl) => {
        const lead = leads.find((l) => l.id === tl.id);
        return {
          id: tl.id,
          name: tl.name || `Lead #${tl.id}`,
          score: lead?.aiScore || lead?.score || 0,
          stage: lead?.status || 'NEW',
          revenue: tl.totalCommission,
          lastContact: lead?.lastContact || lead?.updatedAt || '',
        };
      })
      .slice(0, 10);
  }, [revenueData, leads]);

  // ── Section states for independent error handling ──

  const hasAnyData = !!(funnelData || revenueData || commissionStats || commissions.length > 0 || leads.length > 0);

  // ── RENDER ──

  if (loading) {
    return (
      
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Relatórios</h1>
            <p className="text-sm text-white/40 mt-0.5">
              Dashboard de receitas, comissões e funil de conversão
            </p>
          </div>
          <FullPageSkeleton />
        </div>
      
    );
  }

  if (error && !hasAnyData) {
    return (
      
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Erro ao carregar relatórios
            </h2>
            <p className="text-sm text-white/50 max-w-md mb-6">{error}</p>
            <Button variant="secondary" icon={RefreshCw} onClick={loadData}>
              Tentar novamente
            </Button>
          </div>
        </div>
      
    );
  }

  return (
    
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Relatórios
            </h1>
            <p className="text-sm text-white/40 mt-0.5">
              Dashboard de receitas, comissões e funil de conversão
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={loadData}
            loading={loading}
          >
            Atualizar dados
          </Button>
        </div>

        {/* ── 1. TOP STATS ROW ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Receita Total"
            value={formatCurrency(revenueData?.total || commissionStats?.totalAmount || 0)}
            icon={DollarSign}
            color="emerald"
            change={monthlyChange}
            changeLabel="vs. mês anterior"
          />
          <StatCard
            label="Pendente"
            value={formatCurrency(
              revenueData?.pending || commissionStats?.byStatusSummary?.pending || 0
            )}
            icon={Clock}
            color="amber"
            changeLabel="Comissões a receber"
          />
          <StatCard
            label="Comissões Confirmadas"
            value={
              revenueData?.confirmed || commissionStats?.byStatusSummary?.paid
                ? formatCurrency(
                    revenueData?.confirmed || commissionStats?.byStatusSummary?.paid || 0
                  )
                : formatCurrency(0)
            }
            icon={Zap}
            color="blue"
            changeLabel={
              confirmedCount > 0 ? `${confirmedCount} comissões` : undefined
            }
          />
          <StatCard
            label="Taxa de Conversão"
            value={
              funnelData?.conversionRate != null
                ? `${funnelData.conversionRate}%`
                : commissionStats?.total
                  ? '...'
                  : '0%'
            }
            icon={Percent}
            color="purple"
            changeLabel={
              funnelData?.totalLeads
                ? `NOVO → FECHADO · ${funnelData.totalLeads} leads`
                : undefined
            }
          />
        </div>

        {/* ── 2. REVENUE LINE CHART ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6"
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <BarChart3 size={16} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Receita Mensal</h2>
              <p className="text-xs text-white/40">
                Evolução de comissões confirmadas vs. pendentes
              </p>
            </div>
          </div>
          {error && !monthlyTrends.length ? (
            <SectionError onRetry={loadData} />
          ) : (
            <RevenueLineChart monthlyTrends={monthlyTrends} />
          )}
        </motion.div>

        {/* ── 3. COMMISSION BREAKDOWN ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Donut chart */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6"
          >
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <PieChart size={16} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Composição das Comissões
                </h2>
                <p className="text-xs text-white/40">Distribuição por tipo</p>
              </div>
            </div>

            {donutData.length > 0 ? (
              <>
                <CommissionDonutChart byType={donutData} />
                {/* Donut legend */}
                <div className="flex flex-wrap gap-3 mt-4 justify-center">
                  {donutData.map((item, idx) => (
                    <div key={item.type} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            CHART_COLORS[item.type] ||
                            DONUT_COLORS[idx % DONUT_COLORS.length],
                        }}
                      />
                      <span className="text-white/50">
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                      <span className="text-white/70 font-medium tabular-nums">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </motion.div>

          {/* Commission table */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6"
          >
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Receipt size={16} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Comissões Recentes
                </h2>
                <p className="text-xs text-white/40">
                  {commissions.length > 0
                    ? `${commissions.length} comissões registradas`
                    : 'Registre sua primeira comissão'}
                </p>
              </div>
            </div>
            <CommissionBreakdownTable
              commissions={commissions}
              loading={loading}
            />
          </motion.div>
        </div>

        {/* ── 4. FUNNEL ANALYTICS ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6"
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Layers size={16} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Funil de Conversão
              </h2>
              <p className="text-xs text-white/40">
                Distribuição de leads por etapa com taxas de conversão
              </p>
            </div>
          </div>
          {error && !funnelData ? (
            <SectionError onRetry={loadData} />
          ) : (
            <FunnelBarChart
              stages={funnelData?.stages || []}
              avgTimeInStage={funnelData?.avgTimeInStage || {}}
              conversionRate={funnelData?.conversionRate || 0}
              totalLeads={funnelData?.totalLeads || 0}
              revenueGenerated={funnelData?.revenueGenerated || 0}
            />
          )}
        </motion.div>

        {/* ── 5. TOP LEADS TABLE ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-[24px] border border-white/5 bg-white/[0.03] p-6"
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <UserCheck size={16} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Top Leads por Receita
              </h2>
              <p className="text-xs text-white/40">
                Leads que mais geraram comissões
              </p>
            </div>
          </div>
          <TopLeadsTable topLeads={enrichedTopLeads} />
        </motion.div>
      </motion.div>
    
  );
}
