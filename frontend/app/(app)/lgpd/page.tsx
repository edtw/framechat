'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Shield,
  FileText,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';

interface ConsentRecord {
  id: number;
  leadName?: string;
  lead?: { name: string };
  type: string;
  status: 'GRANTED' | 'REVOKED' | 'PENDING';
  ipAddress?: string;
  consentDate?: string;
  createdAt: string;
}

interface DeletionRequest {
  id: number;
  leadName?: string;
  lead?: { name: string };
  reason?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  requestedAt: string;
  completedAt?: string;
}

const consentStatusConfig: Record<string, { label: string; cls: string }> = {
  GRANTED: { label: 'Concedido', cls: 'badge badge-success' },
  REVOKED: { label: 'Revogado', cls: 'badge badge-error' },
  PENDING: { label: 'Pendente', cls: 'badge badge-warning' },
};

const deletionStatusConfig: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'badge badge-warning' },
  PROCESSING: { label: 'Processando', cls: 'badge badge-info' },
  COMPLETED: { label: 'Concluido', cls: 'badge badge-success' },
  REJECTED: { label: 'Rejeitado', cls: 'badge badge-error' },
};

export default function LGPDPage() {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [consentRes, deletionRes] = await Promise.allSettled([
        api.get('/api/lgpd/consents'),
        api.get('/api/lgpd/deletion-requests'),
      ]);

      if (consentRes.status === 'fulfilled') {
        setConsents(consentRes.value.data.consents || consentRes.value.data || []);
      }
      if (deletionRes.status === 'fulfilled') {
        setDeletionRequests(deletionRes.value.data.requests || deletionRes.value.data || []);
      }
    } catch {
      setError('Erro ao carregar dados LGPD.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Stats
  const totalConsents = consents.length;
  const grantedConsents = consents.filter((c) => c.status === 'GRANTED').length;
  const pendingDeletions = deletionRequests.filter((r) => r.status === 'PENDING').length;
  const completedDeletions = deletionRequests.filter((r) => r.status === 'COMPLETED').length;

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">LGPD Compliance</h1>
            <p className="text-sm text-white/40 mt-0.5">Gestao de consentimentos e privacidade de dados</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Stats Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBadge icon={FileText} label="Total Consentimentos" value={totalConsents} color="text-blue-400" bg="bg-blue-500/10" />
          <StatBadge icon={CheckCircle2} label="Concedidos" value={grantedConsents} color="text-emerald-400" bg="bg-emerald-500/10" />
          <StatBadge icon={Clock} label="Delecoes Pendentes" value={pendingDeletions} color="text-amber-400" bg="bg-amber-500/10" />
          <StatBadge icon={Trash2} label="Delecoes Concluidas" value={completedDeletions} color="text-red-400" bg="bg-red-500/10" />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && (
          <>
            {/* Consent Records */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center gap-2">
                <FileText size={18} className="text-emerald-400" />
                <h2 className="text-sm font-medium text-white">Registros de Consentimento</h2>
              </div>
              {consents.length === 0 ? (
                <p className="text-sm text-white/40 text-center py-10">Nenhum registro de consentimento encontrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Lead</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Tipo</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Status</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Data</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consents.map((c, i) => (
                        <motion.tr
                          key={c.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="px-5 py-3 text-sm text-white">{c.leadName || c.lead?.name || '—'}</td>
                          <td className="px-5 py-3 text-sm text-white/70">{c.type}</td>
                          <td className="px-5 py-3">
                            <span className={cn(consentStatusConfig[c.status]?.cls || 'badge', 'text-[10px]')}>
                              {consentStatusConfig[c.status]?.label || c.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-sm text-white/60">{formatDate(c.consentDate || c.createdAt)}</td>
                          <td className="px-5 py-3 text-sm text-white/40 font-mono text-xs">{c.ipAddress || '—'}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Data Deletion Requests */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center gap-2">
                <Trash2 size={18} className="text-red-400" />
                <h2 className="text-sm font-medium text-white">Solicitacoes de Exclusao de Dados</h2>
              </div>
              {deletionRequests.length === 0 ? (
                <p className="text-sm text-white/40 text-center py-10">Nenhuma solicitacao de exclusao.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Lead</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Motivo</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Status</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Solicitado em</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Concluido em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletionRequests.map((r, i) => (
                        <motion.tr
                          key={r.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="px-5 py-3 text-sm text-white">{r.leadName || r.lead?.name || '—'}</td>
                          <td className="px-5 py-3 text-sm text-white/60 max-w-[200px] truncate">{r.reason || '—'}</td>
                          <td className="px-5 py-3">
                            <span className={cn(deletionStatusConfig[r.status]?.cls || 'badge', 'text-[10px]')}>
                              {deletionStatusConfig[r.status]?.label || r.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-sm text-white/60">{formatDate(r.requestedAt)}</td>
                          <td className="px-5 py-3 text-sm text-white/60">{r.completedAt ? formatDate(r.completedAt) : '—'}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Privacy Policy Viewer */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
              <button
                onClick={() => setPolicyOpen(!policyOpen)}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Eye size={18} className="text-emerald-400" />
                  <h2 className="text-sm font-medium text-white">Politica de Privacidade</h2>
                </div>
                {policyOpen ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
              </button>
              {policyOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="px-5 pb-5 space-y-3"
                >
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-sm text-white/60 space-y-3 max-h-80 overflow-y-auto">
                    <h3 className="text-white font-medium">Politica de Privacidade — AFILIATORS</h3>
                    <p>
                      A AFILIATORS esta comprometida com a protecao dos dados pessoais de seus usuarios, em conformidade com
                      a Lei Geral de Protecao de Dados (Lei n. 13.709/2018 — LGPD).
                    </p>
                    <h4 className="text-white/80 font-medium text-xs uppercase tracking-wider">1. Dados Coletados</h4>
                    <p>
                      Coletamos dados de identificacao (nome, CPF, email, telefone) fornecidos voluntariamente pelos leads
                      durante o processo de cadastro e qualificacao. Dados de navegacao e interacao com a plataforma sao
                      armazenados para fins de melhoria continua.
                    </p>
                    <h4 className="text-white/80 font-medium text-xs uppercase tracking-wider">2. Finalidade</h4>
                    <p>
                      Os dados sao utilizados exclusivamente para gestao de leads, processamento de pagamentos via PIX,
                      comunicacao via WhatsApp, e emisso de cartoes virtuais. Nenhum dado e comercializado ou compartilhado
                      com terceiros sem consentimento explicito.
                    </p>
                    <h4 className="text-white/80 font-medium text-xs uppercase tracking-wider">3. Direitos do Titular</h4>
                    <p>
                      O titular dos dados pode solicitar a qualquer momento: confirmacao da existencia de tratamento,
                      acesso aos dados, correcao de dados incompletos, anonimizacao ou eliminacao de dados desnecessarios,
                      e revogacao do consentimento.
                    </p>
                    <h4 className="text-white/80 font-medium text-xs uppercase tracking-wider">4. Retencao e Exclusao</h4>
                    <p>
                      Os dados sao mantidos apenas pelo periodo necessario para cumprir as finalidades descritas. Solicitacoes
                      de exclusao sao processadas em ate 15 dias uteis, com confirmacao por escrito ao titular.
                    </p>
                    <h4 className="text-white/80 font-medium text-xs uppercase tracking-wider">5. Contato do DPO</h4>
                    <p>
                      Encarregado de Dados (DPO): dpo@afiliators.com.br
                    </p>
                  </div>
                  <button className="btn-secondary flex items-center gap-2">
                    <Download size={14} /> Baixar Politica Completa
                  </button>
                </motion.div>
              )}
            </div>
          </>
        )}
      </motion.div>
    
  );
}

function StatBadge({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', bg)}>
        <Icon size={18} className={color} />
      </div>
      <div>
        <p className="text-xs text-white/40">{label}</p>
        <p className={cn('text-xl font-bold', color)}>{value}</p>
      </div>
    </div>
  );
}
