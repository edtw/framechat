'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CreditCard,
  Snowflake,
  XOctagon,
  Nfc,
  Monitor,
  Copy,
  Check,
  AlertCircle,
  DollarSign,
  Calendar,
  User,
  Hash,
  Shield,
  Store,
} from 'lucide-react';

interface CardDetail {
  id: number;
  last4: string;
  cardholderName: string;
  status: 'ACTIVE' | 'FROZEN' | 'CANCELLED' | 'PENDING';
  spendingLimit?: number;
  spent?: number;
  expiry?: string;
  cardBrand?: string;
  fullNumber?: string;
  cvv?: string;
  nfcCode?: string;
  createdAt?: string;
}

interface CardTransaction {
  id: number;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  status: string;
  createdAt: string;
  merchantName?: string;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Ativo', cls: 'badge badge-success' },
  FROZEN: { label: 'Congelado', cls: 'badge badge-info' },
  CANCELLED: { label: 'Cancelado', cls: 'badge badge-error' },
  PENDING: { label: 'Pendente', cls: 'badge badge-warning' },
};

export default function VirtualCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [card, setCard] = useState<CardDetail | null>(null);
  const [transactions, setTransactions] = useState<CardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: cardData } = await api.get(`/api/virtual-cards/${id}`);
      const cardInfo = cardData.card || cardData;
      setCard(cardInfo);

      // Fetch transactions
      try {
        const { data: txData } = await api.get(`/api/virtual-cards/${id}/transactions`);
        setTransactions(txData.transactions || txData || []);
      } catch { /* transactions might not be available yet */ }
    } catch {
      setError('Erro ao carregar cartao.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (action: 'freeze' | 'unfreeze' | 'cancel') => {
    if (!confirm(`Tem certeza que deseja ${action === 'freeze' ? 'congelar' : action === 'unfreeze' ? 'descongelar' : 'cancelar'} este cartao?`)) return;
    setActionLoading(action);
    try {
      const endpoint =
        action === 'cancel'
          ? `/api/virtual-cards/${id}`
          : `/api/virtual-cards/${id}/${action}`;
      const method = action === 'cancel' ? 'delete' : 'post';
      await api({ method, url: endpoint });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || `Erro ao ${action} cartao.`);
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (field: string, value: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const spentPct = card && card.spendingLimit && card.spendingLimit > 0
    ? Math.min(100, ((card.spent || 0) / card.spendingLimit) * 100)
    : 0;

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5 max-w-4xl">
        {/* Nav */}
        <button onClick={() => router.push('/virtual-cards')} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Voltar para Cartoes
        </button>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {card && (
          <>
            {/* Visual Card */}
            <div className="relative bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-white/10 rounded-2xl backdrop-blur-xl p-6 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <CreditCard size={26} className="text-white/60" />
                  <span className="text-xs uppercase tracking-widest text-white/40">{card.cardBrand || 'VISA'}</span>
                </div>
                <p className="text-2xl font-mono tracking-[0.3em] text-white mb-6">
                  •••• •••• •••• {card.last4}
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Titular</p>
                    <p className="text-sm text-white font-medium">{card.cardholderName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Validade</p>
                    <p className="text-sm text-white font-medium">{card.expiry || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              {card.status === 'ACTIVE' && (
                <button
                  onClick={() => handleAction('freeze')}
                  disabled={actionLoading === 'freeze'}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Snowflake size={16} className="text-blue-400" />
                  {actionLoading === 'freeze' ? 'Congelando...' : 'Congelar'}
                </button>
              )}
              {card.status === 'FROZEN' && (
                <button
                  onClick={() => handleAction('unfreeze')}
                  disabled={actionLoading === 'unfreeze'}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Snowflake size={16} className="text-emerald-400" />
                  {actionLoading === 'unfreeze' ? 'Descongelando...' : 'Descongelar'}
                </button>
              )}
              {(card.status === 'ACTIVE' || card.status === 'FROZEN') && (
                <button
                  onClick={() => handleAction('cancel')}
                  disabled={actionLoading === 'cancel'}
                  className="btn-danger flex items-center gap-2"
                >
                  <XOctagon size={16} />
                  {actionLoading === 'cancel' ? 'Cancelando...' : 'Cancelar Cartao'}
                </button>
              )}
              <span className={cn(statusConfig[card.status]?.cls || 'badge', 'self-center ml-auto')}>
                {statusConfig[card.status]?.label || card.status}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                <p className="text-xs text-white/40">Limite de Gastos</p>
                <p className="text-lg font-bold text-white mt-1">{formatCurrency(card.spendingLimit || 0)}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                <p className="text-xs text-white/40">Gasto Total</p>
                <p className="text-lg font-bold text-white mt-1">{formatCurrency(card.spent || 0)}</p>
                {card.spendingLimit != null && card.spendingLimit > 0 && (
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        spentPct > 80 ? 'bg-red-500' : spentPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                      )}
                      style={{ width: `${spentPct}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                <p className="text-xs text-white/40">Disponivel</p>
                <p className="text-lg font-bold text-emerald-400 mt-1">
                  {formatCurrency(Math.max(0, (card.spendingLimit || 0) - (card.spent || 0)))}
                </p>
              </div>
            </div>

            {/* NFC Linking */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <Nfc size={20} className="text-emerald-400" />
                <h2 className="text-sm font-medium text-white">Vinculacao NFC</h2>
              </div>
              {card.nfcCode ? (
                <div className="flex items-center gap-3">
                  <code className="text-sm text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-xl font-mono">{card.nfcCode}</code>
                  <button
                    onClick={() => copyToClipboard('nfc', card.nfcCode!)}
                    className="text-white/40 hover:text-white transition-colors"
                  >
                    {copiedField === 'nfc' ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-white/40">Nenhum codigo NFC gerado. O codigo sera gerado quando o cartao for utilizado.</p>
              )}
            </div>

            {/* Payment Machine Info */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <Monitor size={20} className="text-emerald-400" />
                <h2 className="text-sm font-medium text-white">Maquininha</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Store size={14} className="text-white/30" />
                  <span className="text-white/60">Aproxime o cartao virtual na maquininha via NFC</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Shield size={14} className="text-white/30" />
                  <span className="text-white/60">Transacoes protegidas com criptografia ponta a ponta</span>
                </div>
              </div>
            </div>

            {/* Transactions */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
              <div className="p-5 border-b border-white/10">
                <h2 className="text-sm font-medium text-white">Historico de Transacoes</h2>
              </div>
              {transactions.length === 0 ? (
                <p className="text-sm text-white/40 text-center py-10">Nenhuma transacao registrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Data</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Descricao</th>
                        <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Estabelecimento</th>
                        <th className="text-right text-xs text-white/40 font-medium px-5 py-3">Valor</th>
                        <th className="text-center text-xs text-white/40 font-medium px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx, i) => (
                        <motion.tr
                          key={tx.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="px-5 py-3 text-sm text-white/60">{formatDate(tx.createdAt)}</td>
                          <td className="px-5 py-3 text-sm text-white">{tx.description}</td>
                          <td className="px-5 py-3 text-sm text-white/60">{tx.merchantName || '—'}</td>
                          <td className={cn(
                            'px-5 py-3 text-sm font-medium text-right',
                            tx.type === 'DEBIT' ? 'text-red-400' : 'text-emerald-400'
                          )}>
                            {tx.type === 'DEBIT' ? '-' : '+'}{formatCurrency(tx.amount)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={cn(
                              'text-[10px] badge',
                              tx.status === 'COMPLETED' ? 'badge-success' :
                              tx.status === 'PENDING' ? 'badge-warning' : 'badge-error'
                            )}>
                              {tx.status === 'COMPLETED' ? 'Concluido' :
                               tx.status === 'PENDING' ? 'Pendente' : tx.status}
                            </span>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    
  );
}
