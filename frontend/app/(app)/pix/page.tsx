'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { extractList } from '@/lib/api-helpers';
import { motion } from 'framer-motion';
import {
  Plus,
  DollarSign,
  AlertCircle,
  Search,
  Filter,
  Download,
} from 'lucide-react';

interface PIXTransaction {
  id: number;
  leadName?: string;
  lead?: { name: string };
  amount: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  pixKey?: string;
  merchantName?: string;
  createdAt: string;
  paidAt?: string;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'badge badge-warning' },
  PAID: { label: 'Pago', cls: 'badge badge-success' },
  EXPIRED: { label: 'Expirado', cls: 'badge badge-error' },
};

export default function PIXPage() {
  const router = useRouter();

  const [transactions, setTransactions] = useState<PIXTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/pix/transactions', {
        params: { status: statusFilter !== 'ALL' ? statusFilter : undefined, search: search || undefined },
      });
      setTransactions(extractList(data, 'transactions') as PIXTransaction[]);
    } catch {
      setError('Erro ao carregar transacoes PIX.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const totalRecebido = transactions
    .filter((t) => t.status === 'PAID')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const filters = [
    { key: 'ALL', label: 'Todos' },
    { key: 'PENDING', label: 'Pendentes' },
    { key: 'PAID', label: 'Pagos' },
    { key: 'EXPIRED', label: 'Expirados' },
  ];

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Transacoes PIX</h1>
            <p className="text-sm text-white/40 mt-0.5">Gerencie cobrancas e pagamentos via PIX</p>
          </div>
          <button onClick={() => router.push('/pix/generate')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Gerar PIX
          </button>
        </div>

        {/* Total Card */}
        <div className="bg-white/[0.03] border border-emerald-500/20 rounded-2xl backdrop-blur-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Total Recebido</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(totalRecebido)}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <DollarSign size={24} className="text-emerald-400" />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-1">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg transition-all',
                  statusFilter === f.key
                    ? 'bg-emerald-500 text-white font-medium'
                    : 'text-white/50 hover:text-white'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              placeholder="Buscar por lead..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9 py-2 text-xs"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-12 rounded-xl" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-16">
              <DollarSign size={40} className="text-white/20 mx-auto mb-3" />
              <p className="text-white/40 mb-4">Nenhuma transacao encontrada.</p>
              <button onClick={() => router.push('/pix/generate')} className="btn-primary">
                Gerar Primeiro PIX
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Data</th>
                    <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Lead</th>
                    <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Valor</th>
                    <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Status</th>
                    <th className="text-left text-xs text-white/40 font-medium px-5 py-3">Pago em</th>
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
                      <td className="px-5 py-3 text-sm text-white/70">{formatDate(tx.createdAt)}</td>
                      <td className="px-5 py-3 text-sm text-white">{tx.leadName || tx.lead?.name || '—'}</td>
                      <td className="px-5 py-3 text-sm text-emerald-400 font-medium">{formatCurrency(tx.amount)}</td>
                      <td className="px-5 py-3">
                        <span className={cn(statusConfig[tx.status]?.cls || 'badge', 'text-[10px]')}>
                          {statusConfig[tx.status]?.label || tx.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-white/50">
                        {tx.paidAt ? formatDate(tx.paidAt) : '—'}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    
  );
}
