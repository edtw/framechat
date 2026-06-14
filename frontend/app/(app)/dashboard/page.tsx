'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import StatsCard from '@/components/dashboard/StatsCard';
import { Button } from '@/components/ui/Button';
import { useLeadApi } from '@/hooks/useLeadApi';
import api from '@/lib/api';
import { formatCurrency, timeAgo, cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Users,
  MessageCircle,
  TrendingUp,
  DollarSign,
  UserPlus,
  Receipt,
  MessageSquare,
  Sparkles,
  ChevronRight,
  Target,
  Phone,
  Star,
  Zap,
  Clock,
  AlertCircle,
  RefreshCw,
  Layers,
  Activity,
  Lightbulb,
} from 'lucide-react';

// ==================== TYPES ====================

interface PipelineStage {
  key: string;
  label: string;
  count: number;
  color: 'blue' | 'purple' | 'orange' | 'green' | 'emerald';
}

interface ActivityItem {
  id: string | number;
  type: 'lead_created' | 'message_received' | 'deal_won' | 'lead_updated' | 'task_completed';
  title: string;
  description: string;
  timestamp: string;
  leadName?: string;
  value?: number;
}

interface AIRecommendation {
  id: string;
  icon: 'target' | 'phone' | 'message' | 'star' | 'zap';
  title: string;
  description: string;
  action?: string;
  actionLabel?: string;
}

interface DashboardData {
  activeLeads: number;
  todayMessages: number;
  totalRevenue: number;
  conversionRate: number;
  leadsTrend: number;
  messagesTrend: number;
  revenueTrend: number;
  conversionTrend: number;
  pipeline: PipelineStage[];
  recentActivity: ActivityItem[];
  aiRecommendations: AIRecommendation[];
}

// ==================== MOCK AI RECOMMENDATIONS ====================

const DEFAULT_AI_RECOMMENDATIONS: AIRecommendation[] = [
  {
    id: '1',
    icon: 'phone',
    title: 'Leads aguardando retorno',
    description: 'Voc tem 3 leads que no recebem contato h mais de 48 horas. Um follow-up rpido pode aumentar a converso em at 40%.',
    action: '/leads?status=CONTATO',
    actionLabel: 'Ver leads',
  },
  {
    id: '2',
    icon: 'target',
    title: 'Oportunidade de fechamento',
    description: '2 leads esto na fase de Proposta h mais de 5 dias. Envie um lembrete personalizado com condies especiais.',
    action: '/leads?status=PROPOSTA',
    actionLabel: 'Agir agora',
  },
  {
    id: '3',
    icon: 'star',
    title: 'Horrio nobre de WhatsApp',
    description: 'Seus leads respondem mais entre 10h e 11h30. Agende os disparos de mensagem para este perodo.',
  },
  {
    id: '4',
    icon: 'zap',
    title: 'Taxa de converso em alta',
    description: 'Sua taxa de converso subiu 12% esta semana. Considere replicar a abordagem usada com os ltimos leads fechados.',
  },
];

// ==================== FALLBACK PIPELINE ====================

const EMPTY_PIPELINE: PipelineStage[] = [
  { key: 'NOVO', label: 'Novos', count: 0, color: 'blue' },
  { key: 'CONTATO', label: 'Em Contato', count: 0, color: 'purple' },
  { key: 'QUALIFICADO', label: 'Qualificados', count: 0, color: 'orange' },
  { key: 'PROPOSTA', label: 'Proposta', count: 0, color: 'green' },
  { key: 'FECHADO', label: 'Fechados', count: 0, color: 'emerald' },
];

// ==================== CONSTANTS ====================

const PIPELINE_COLOR_MAP: Record<string, PipelineStage['color']> = {
  NOVO: 'blue',
  NEW: 'blue',
  CONTATO: 'purple',
  CONTACTED: 'purple',
  QUALIFICADO: 'orange',
  QUALIFIED: 'orange',
  PROPOSTA: 'green',
  PROPOSAL: 'green',
  NEGOTIATION: 'green',
  FECHADO: 'emerald',
  WON: 'emerald',
};

const STATUS_TO_PIPELINE: Record<string, string> = {
  NOVO: 'NOVO',
  NEW: 'NOVO',
  CONTATO: 'CONTATO',
  CONTACTED: 'CONTATO',
  QUALIFICADO: 'QUALIFICADO',
  QUALIFIED: 'QUALIFICADO',
  PROPOSTA: 'PROPOSTA',
  PROPOSAL: 'PROPOSTA',
  NEGOTIATION: 'PROPOSTA',
  FECHADO: 'FECHADO',
  WON: 'FECHADO',
};

const PIPELINE_ORDER = ['NOVO', 'CONTATO', 'QUALIFICADO', 'PROPOSTA', 'FECHADO'];

// ==================== SUB-COMPONENTS ====================

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-7 w-40 rounded-lg" />
          <div className="skeleton h-4 w-64 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-10 w-32 rounded-xl" />
          <div className="skeleton h-10 w-32 rounded-xl" />
          <div className="skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-[28px] border border-white/5 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-3 flex-1">
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton h-8 w-16 rounded-lg" />
                <div className="skeleton h-3 w-12 rounded" />
              </div>
              <div className="skeleton w-12 h-12 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline + Activity skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-[28px] border border-white/5 bg-white/[0.03] p-6">
            <div className="skeleton h-5 w-48 rounded-lg mb-4" />
            <div className="grid grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-24 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-[28px] border border-white/5 bg-white/[0.03] p-6">
          <div className="skeleton h-5 w-36 rounded-lg mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {/* AI Insights skeleton */}
      <div className="rounded-[28px] border border-white/5 bg-white/[0.03] p-6">
        <div className="skeleton h-5 w-48 rounded-lg mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 px-4 text-center"
    >
      <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
        <AlertCircle className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">Erro ao carregar dados</h2>
      <p className="text-sm text-white/50 max-w-md mb-6">{message}</p>
      <Button variant="secondary" icon={RefreshCw} onClick={onRetry}>
        Tentar novamente
      </Button>
    </motion.div>
  );
}

function EmptyState() {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 px-4 text-center"
    >
      <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
        <Users className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">Nenhum dado encontrado</h2>
      <p className="text-sm text-white/50 max-w-md mb-6">
        Comece cadastrando seu primeiro lead para ver estatsticas e insights aqui.
      </p>
      <Button variant="primary" icon={UserPlus} onClick={() => router.push('/leads?action=new')}>
        Cadastrar primeiro lead
      </Button>
    </motion.div>
  );
}

function PipelineBar({ stages, total }: { stages: PipelineStage[]; total: number }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => (
          <div key={stage.key} className="flex-1 min-w-[100px]">
            <div
              className={cn(
                'rounded-2xl border p-4 text-center transition-all hover:border-opacity-50 cursor-default',
                'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
              )}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <div
                  className={cn(
                    'w-2.5 h-2.5 rounded-full',
                    stage.color === 'blue' && 'bg-blue-400',
                    stage.color === 'purple' && 'bg-purple-400',
                    stage.color === 'orange' && 'bg-amber-400',
                    stage.color === 'green' && 'bg-green-400',
                    stage.color === 'emerald' && 'bg-emerald-400'
                  )}
                />
                <span className="text-[10px] uppercase tracking-wider text-white/40">{stage.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{stage.count}</p>
              <p className="text-[10px] text-white/30 mt-0.5">
                {total > 0 ? `${Math.round((stage.count / total) * 100)}%` : '0%'}
              </p>
            </div>
          </div>
        ))}
      </div>
      {/* Total bar */}
      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
          {stages.map((stage) => {
            const pct = (stage.count / total) * 100;
            if (pct <= 0) return null;
            return (
              <motion.div
                key={stage.key}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={cn(
                  'h-full',
                  stage.color === 'blue' && 'bg-blue-500',
                  stage.color === 'purple' && 'bg-purple-500',
                  stage.color === 'orange' && 'bg-amber-500',
                  stage.color === 'green' && 'bg-green-500',
                  stage.color === 'emerald' && 'bg-emerald-500'
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const activityConfig: Record<string, { icon: React.ElementType; color: string; bgClass: string }> = {
    lead_created: { icon: UserPlus, color: 'text-blue-400', bgClass: 'bg-blue-500/10 border-blue-500/20' },
    message_received: { icon: MessageSquare, color: 'text-purple-400', bgClass: 'bg-purple-500/10 border-purple-500/20' },
    deal_won: { icon: Star, color: 'text-amber-400', bgClass: 'bg-amber-500/10 border-amber-500/20' },
    lead_updated: { icon: Activity, color: 'text-emerald-400', bgClass: 'bg-emerald-500/10 border-emerald-500/20' },
    task_completed: { icon: Clock, color: 'text-green-400', bgClass: 'bg-green-500/10 border-green-500/20' },
  };

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const config = activityConfig[item.type] || activityConfig.lead_updated;
        const Icon = config.icon;
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.03] transition-colors cursor-default"
          >
            <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center shrink-0', config.bgClass)}>
              <Icon size={14} className={config.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/90 truncate">{item.title}</p>
              <p className="text-xs text-white/40 mt-0.5 truncate">{item.description}</p>
            </div>
            <span className="text-[10px] text-white/30 whitespace-nowrap mt-1">{timeAgo(item.timestamp)}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

function AIInsightCard({ recommendations }: { recommendations: AIRecommendation[] }) {
  const router = useRouter();
  const iconMap: Record<string, React.ElementType> = {
    target: Target,
    phone: Phone,
    message: MessageSquare,
    star: Star,
    zap: Zap,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {recommendations.map((rec, i) => {
        const Icon = iconMap[rec.icon] || Lightbulb;
        return (
          <motion.div
            key={rec.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 hover:border-emerald-500/20 hover:bg-white/[0.04] transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Icon size={16} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-white mb-1">{rec.title}</h4>
                <p className="text-xs text-white/50 leading-relaxed mb-3">{rec.description}</p>
                {rec.action && rec.actionLabel && (
                  <button
                    onClick={() => router.push(rec.action!)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors group-hover:underline"
                  >
                    {rec.actionLabel}
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function DashboardPage() {
  const router = useRouter();
  const { fetchLeads, fetchLeadStats } = useLeadApi();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orchestratorData, setOrchestratorData] = useState<Record<string, number> | null>(null);
  const [orchestratorAlerts, setOrchestratorAlerts] = useState(0);
  const [data, setData] = useState<DashboardData>({
    activeLeads: 0,
    todayMessages: 0,
    totalRevenue: 0,
    conversionRate: 0,
    leadsTrend: 0,
    messagesTrend: 0,
    revenueTrend: 0,
    conversionTrend: 0,
    pipeline: EMPTY_PIPELINE.map((s) => ({ ...s })),
    recentActivity: [],
    aiRecommendations: [],
  });

  const isEmpty = !loading && !error && data.activeLeads === 0 && data.todayMessages === 0 && data.totalRevenue === 0;

  // Helper to compute pipeline from a list of leads
  const computePipeline = useCallback((leads: any[]): PipelineStage[] => {
    const counts: Record<string, number> = { NOVO: 0, CONTATO: 0, QUALIFICADO: 0, PROPOSTA: 0, FECHADO: 0 };
    leads.forEach((lead) => {
      const status = lead.status || lead.stage || '';
      const pipelineKey = STATUS_TO_PIPELINE[status];
      if (pipelineKey && counts[pipelineKey] !== undefined) {
        counts[pipelineKey]++;
      }
    });
    return PIPELINE_ORDER.map((key) => ({
      key,
      label: EMPTY_PIPELINE.find((s) => s.key === key)?.label || key,
      count: counts[key] || 0,
      color: PIPELINE_COLOR_MAP[key] || 'blue',
    }));
  }, []);

  // Helper to derive activity from leads
  const deriveActivity = useCallback((leads: any[]): ActivityItem[] => {
    const items: ActivityItem[] = [];
    const recent = [...leads]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 10);

    recent.forEach((lead) => {
      const status = lead.status || lead.stage || '';
      const pipelineKey = STATUS_TO_PIPELINE[status];
      if (pipelineKey === 'FECHADO' && lead.value > 0) {
        items.push({
          id: `won-${lead.id}`,
          type: 'deal_won',
          title: `Negcio fechado: ${lead.name}`,
          description: lead.value ? `Valor: ${formatCurrency(lead.value)}` : 'Sem valor informado',
          timestamp: lead.updatedAt || lead.createdAt,
          leadName: lead.name,
          value: lead.value,
        });
      } else if (pipelineKey === 'NOVO' || lead.createdAt) {
        items.push({
          id: `created-${lead.id}`,
          type: 'lead_created',
          title: `Lead criado: ${lead.name}`,
          description: lead.company ? `Empresa: ${lead.company}` : 'Novo lead adicionado ao funil',
          timestamp: lead.createdAt || lead.updatedAt,
          leadName: lead.name,
        });
      }
    });

    // Sort by timestamp descending and take top 5
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, []);

  // Helper to compute AI recommendations from actual lead data
  const computeAIRecommendations = useCallback((leads: any[]): AIRecommendation[] => {
    const recommendations: AIRecommendation[] = [];
    const now = new Date();
    const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
    const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;

    // 1. Stale leads — active leads with no contact for 48+ hours
    const staleLeads = leads.filter((l: any) => {
      const status = l.status || l.stage || '';
      if (status === 'LOST' || status === 'PERDIDO' || status === 'WON' || status === 'FECHADO') return false;
      if (!l.lastContact && !l.updatedAt) return false;
      const lastActivity = new Date(l.lastContact || l.updatedAt).getTime();
      return (now.getTime() - lastActivity) > FORTY_EIGHT_HOURS;
    });

    if (staleLeads.length > 0) {
      recommendations.push({
        id: 'stale-leads',
        icon: 'phone',
        title: `${staleLeads.length} lead${staleLeads.length > 1 ? 's' : ''} aguardando retorno`,
        description: staleLeads.length === 1
          ? `${staleLeads[0].name} está sem contato há mais de 48 horas. Um follow-up rápido pode reengajar o lead.`
          : `${staleLeads.slice(0, 2).map((l: any) => l.name).join(' e ')}${staleLeads.length > 2 ? ` e mais ${staleLeads.length - 2}` : ''} estão sem contato há mais de 48 horas.`,
        action: '/leads',
        actionLabel: 'Ver leads parados',
      });
    }

    // 2. Overdue proposals — leads in proposal stage for 5+ days
    const overdueProposals = leads.filter((l: any) => {
      const status = l.status || l.stage || '';
      const isProposal = status === 'PROPOSAL' || status === 'PROPOSTA' || status === 'NEGOTIATION';
      if (!isProposal) return false;
      const updated = new Date(l.updatedAt || l.createdAt).getTime();
      return (now.getTime() - updated) > FIVE_DAYS;
    });

    if (overdueProposals.length > 0) {
      recommendations.push({
        id: 'overdue-proposals',
        icon: 'target',
        title: `${overdueProposals.length} proposta${overdueProposals.length > 1 ? 's' : ''} aguardando`,
        description: overdueProposals.length === 1
          ? `${overdueProposals[0].name} está na fase de proposta há mais de 5 dias. Considere enviar um lembrete com condições especiais.`
          : `${overdueProposals.length} leads estão na fase de proposta há mais de 5 dias. Um follow-up agora pode destravar o pipeline.`,
        action: '/leads?status=PROPOSTA',
        actionLabel: 'Ver propostas',
      });
    }

    // 3. Recent wins — celebrate and replicate
    const recentWins = leads.filter((l: any) => {
      const status = l.status || l.stage || '';
      return status === 'WON' || status === 'FECHADO';
    }).sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

    if (recentWins.length > 0) {
      const totalWonValue = recentWins.reduce((sum: number, l: any) => sum + (Number(l.value) || 0), 0);
      recommendations.push({
        id: 'recent-wins',
        icon: 'star',
        title: `${recentWins.length} negócio${recentWins.length > 1 ? 's' : ''} fechado${recentWins.length > 1 ? 's' : ''}`,
        description: totalWonValue > 0
          ? `${recentWins.length} leads convertidos com sucesso, totalizando ${formatCurrency(totalWonValue)}. Analise a abordagem usada para replicar nos próximos.`
          : `${recentWins.length} leads convertidos recentemente. Continue com a mesma estratégia de abordagem.`,
        action: '/relatorios',
        actionLabel: 'Ver métricas',
      });
    }

    // 4. New leads today — quick engagement opportunity
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayLeads = leads.filter((l: any) => {
      const created = new Date(l.createdAt).getTime();
      return created >= todayStart;
    });

    if (todayLeads.length > 0) {
      recommendations.push({
        id: 'today-leads',
        icon: 'zap',
        title: `${todayLeads.length} novo${todayLeads.length > 1 ? 's' : ''} lead${todayLeads.length > 1 ? 's' : ''} hoje`,
        description: `Você recebeu ${todayLeads.length} lead${todayLeads.length > 1 ? 's' : ''} hoje. Leads contatados na primeira hora têm 7x mais chance de conversão.`,
        action: '/leads?status=NOVO',
        actionLabel: todayLeads.length > 1 ? 'Ver novos leads' : 'Ver novo lead',
      });
    }

    // Fallback: if we couldn't compute any data-driven insights, use defaults
    if (recommendations.length === 0) {
      recommendations.push({
        id: 'general-tip',
        icon: 'target',
        title: 'Dica de conversão',
        description: 'Leads que recebem follow-up em até 1 hora têm 7x mais chance de conversão. Mantenha o WhatsApp sempre conectado para respostas rápidas.',
        action: '/whatsapp',
        actionLabel: 'Ver WhatsApp',
      });
      recommendations.push({
        id: 'peak-time',
        icon: 'zap',
        title: 'Melhor horário de contato',
        description: 'Seus leads respondem mais entre 10h e 11h30 da manhã. Agende os disparos de mensagem para este período.',
      });
    }

    return recommendations;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    let cachedLeadsList: any[] = [];
    try {
      const [leadsResult, statsResult, orchResult, alertsResult] = await Promise.allSettled([
        fetchLeads({ limit: 50 }),
        fetchLeadStats(),
        api.get('/api/orchestrator/pipeline').catch(() => ({ data: null })),
        api.get('/api/orchestrator/alerts?severity=CRITICAL').catch(() => ({ data: null })),
      ]);

      let activeLeads = 0;
      let todayMessages = 0;
      let totalRevenue = 0;
      let conversionRate = 0;
      let leadsTrend = 0;
      let messagesTrend = 0;
      let revenueTrend = 0;
      let conversionTrend = 0;
      let pipeline = EMPTY_PIPELINE.map((s) => ({ ...s }));
      let recentActivity: ActivityItem[] = [];

      // Process stats
      if (statsResult.status === 'fulfilled' && statsResult.value) {
        const s = statsResult.value;
        activeLeads = s.activeLeads ?? s.totalLeads ?? 0;
        todayMessages = s.todayMessages ?? s.messagesToday ?? 0;
        totalRevenue = s.pixTotal ?? s.totalRevenue ?? s.revenue ?? 0;
        conversionRate = s.conversionRate ?? s.conversion ?? 0;
        leadsTrend = s.leadsTrend ?? s.leadsChange ?? 0;
        messagesTrend = s.messagesTrend ?? s.messagesChange ?? 0;
        revenueTrend = s.revenueTrend ?? s.revenueChange ?? 0;
        conversionTrend = s.conversionTrend ?? s.conversionChange ?? 0;

        // API may provide pipeline directly
        if (s.pipeline) {
          pipeline = PIPELINE_ORDER.map((key) => ({
            key,
            label: EMPTY_PIPELINE.find((p) => p.key === key)?.label || key,
            count: s.pipeline[key.toLowerCase()] || s.pipeline[key] || 0,
            color: PIPELINE_COLOR_MAP[key] || 'blue',
          }));
        }

        // API may provide activity directly
        if (Array.isArray(s.recentActivity) && s.recentActivity.length > 0) {
          recentActivity = s.recentActivity.slice(0, 5);
        }
      }

      // Process leads (for pipeline + activity fallback)
      if (leadsResult.status === 'fulfilled' && leadsResult.value) {
        const leadsList = leadsResult.value.leads || leadsResult.value.data || leadsResult.value || [];

        cachedLeadsList = Array.isArray(leadsList) ? leadsList : [];

        if (cachedLeadsList.length > 0) {
          // Compute pipeline from leads if API didn't provide
          if (pipeline.every((s) => s.count === 0)) {
            pipeline = computePipeline(cachedLeadsList);
          }

          // Derive activity from leads if API didn't provide
          if (recentActivity.length === 0) {
            recentActivity = deriveActivity(cachedLeadsList);
          }

          // Fallback stats from leads if stats failed
          if (statsResult.status === 'rejected') {
            activeLeads = leadsList.filter((l: any) => {
              const s = l.status || l.stage || '';
              return s !== 'LOST' && s !== 'PERDIDO';
            }).length;
            totalRevenue = leadsList.reduce((sum: number, l: any) => {
              const s = l.status || l.stage || '';
              if ((s === 'WON' || s === 'FECHADO') && l.value) return sum + Number(l.value);
              return sum;
            }, 0);
          }
        }
      }

      // Process orchestrator data
      if (orchResult.status === 'fulfilled' && orchResult.value?.data?.pipeline) {
        setOrchestratorData(orchResult.value.data.pipeline);
      }
      if (alertsResult.status === 'fulfilled' && alertsResult.value?.data) {
        setOrchestratorAlerts(alertsResult.value.data.total || alertsResult.value.data.alerts?.length || 0);
      }

      setData({
        activeLeads,
        todayMessages,
        totalRevenue,
        conversionRate,
        leadsTrend,
        messagesTrend,
        revenueTrend,
        conversionTrend,
        pipeline,
        recentActivity,
        aiRecommendations: computeAIRecommendations(cachedLeadsList),
      });
    } catch {
      setError('No foi possvel carregar os dados do dashboard. Verifique sua conexo e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [fetchLeads, fetchLeadStats, computePipeline, deriveActivity, computeAIRecommendations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived values
  const pipelineTotal = useMemo(
    () => data.pipeline.reduce((sum, s) => sum + s.count, 0),
    [data.pipeline]
  );

  // ==================== RENDER ====================

  return (
    
      <div className="p-6 md:p-8 space-y-6 max-w-[1600px] mx-auto">
        {/* Loading */}
        {loading && <LoadingSkeleton />}

        {/* Error */}
        {!loading && error && <ErrorState message={error} onRetry={loadData} />}

        {/* Empty */}
        {!loading && !error && isEmpty && <EmptyState />}

        {/* Content */}
        {!loading && !error && !isEmpty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
            className="space-y-6"
          >
            {/* ==================== HEADER ==================== */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
                <p className="text-sm text-white/40 mt-0.5">Viso geral da sua operao de afiliao</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  icon={UserPlus}
                  onClick={() => router.push('/leads?action=new')}
                >
                  Novo Lead
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon={Receipt}
                  onClick={() => router.push('/pix/generate')}
                >
                  Nova Cobrana
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon={MessageSquare}
                  onClick={() => router.push('/whatsapp')}
                >
                  Nova Conversa
                </Button>
              </div>
            </div>

            {/* ==================== STAT CARDS ==================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Leads Ativos"
                value={data.activeLeads}
                icon={Users}
                color="blue"
                trend={
                  data.leadsTrend !== 0
                    ? {
                        value: `${data.leadsTrend > 0 ? '+' : ''}${data.leadsTrend}% vs. semana anterior`,
                        isPositive: data.leadsTrend > 0,
                      }
                    : null
                }
              />
              <StatsCard
                title="Mensagens Hoje"
                value={data.todayMessages}
                icon={MessageCircle}
                color="purple"
                trend={
                  data.messagesTrend !== 0
                    ? {
                        value: `${data.messagesTrend > 0 ? '+' : ''}${data.messagesTrend}% vs. ontem`,
                        isPositive: data.messagesTrend > 0,
                      }
                    : null
                }
              />
              <StatsCard
                title="Receita Total"
                value={formatCurrency(data.totalRevenue)}
                icon={DollarSign}
                color="green"
                trend={
                  data.revenueTrend !== 0
                    ? {
                        value: `${data.revenueTrend > 0 ? '+' : ''}${data.revenueTrend}% vs. ms anterior`,
                        isPositive: data.revenueTrend > 0,
                      }
                    : null
                }
              />
              <StatsCard
                title="Taxa de Converso"
                value={`${data.conversionRate}%`}
                icon={TrendingUp}
                color="orange"
                trend={
                  data.conversionTrend !== 0
                    ? {
                        value: `${data.conversionTrend > 0 ? '+' : ''}${data.conversionTrend} pontos`,
                        isPositive: data.conversionTrend > 0,
                      }
                    : null
                }
              />
            </div>

            {/* ==================== PIPELINE + ACTIVITY ==================== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Pipeline Overview */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-2 rounded-[28px] border border-white/5 bg-white/[0.03] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <Layers size={16} className="text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-white">Pipeline de Leads</h2>
                      <p className="text-xs text-white/40">{pipelineTotal} leads no funil</p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push('/leads')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                  >
                    Ver todos
                    <ChevronRight size={12} />
                  </button>
                </div>
                <PipelineBar stages={data.pipeline} total={pipelineTotal} />
              </motion.div>

              {/* Recent Activity */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-[28px] border border-white/5 bg-white/[0.03] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <Activity size={16} className="text-purple-400" />
                    </div>
                    <h2 className="text-sm font-semibold text-white">Atividades Recentes</h2>
                  </div>
                </div>
                {data.recentActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Clock className="w-8 h-8 text-white/20 mb-2" />
                    <p className="text-sm text-white/40">Nenhuma atividade recente</p>
                    <p className="text-xs text-white/25 mt-1">As aes com seus leads aparecero aqui.</p>
                  </div>
                ) : (
                  <ActivityFeed items={data.recentActivity} />
                )}
              </motion.div>
            </div>

            {/* ==================== AI INSIGHTS ==================== */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-[28px] border border-white/5 bg-white/[0.03] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
            >
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Sparkles size={16} className="text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Sugestes do Dia</h2>
                  <p className="text-xs text-white/40">Recomendaes baseadas em IA para otimizar seus resultados</p>
                </div>
              </div>
              <AIInsightCard recommendations={data.aiRecommendations} />
            </motion.div>
          </motion.div>
        )}
      </div>
    
  );
}
