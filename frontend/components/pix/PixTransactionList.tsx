'use client';

import React from 'react';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CreditCard, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

type PixStatus = 'pending' | 'completed' | 'expired' | 'failed';

interface PixTransaction {
  id: string;
  txid: string;
  amount: number;
  status: PixStatus;
  leadName: string;
  leadId: string;
  createdAt: string;
  updatedAt: string;
}

interface PixTransactionListProps {
  transactions: PixTransaction[];
  loading?: boolean;
}

const STATUS_MAP: Record<
  PixStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' }
> = {
  pending: { label: 'Pendente', variant: 'warning' },
  completed: { label: 'Concluido', variant: 'success' },
  expired: { label: 'Expirado', variant: 'error' },
  failed: { label: 'Falhou', variant: 'error' },
};

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl animate-pulse"
        >
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-white/5 rounded w-32" />
            <div className="h-3 bg-white/5 rounded w-24" />
          </div>
          <div className="h-3 bg-white/5 rounded w-20" />
          <div className="h-3 bg-white/5 rounded w-16" />
          <div className="h-6 bg-white/5 rounded-full w-20" />
        </div>
      ))}
    </div>
  );
}

export function PixTransactionList({
  transactions,
  loading = false,
}: PixTransactionListProps) {
  if (loading) {
    return <LoadingSkeleton />;
  }

  if (transactions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
          <CreditCard className="w-8 h-8 text-white/20" />
        </div>
        <h3 className="text-sm font-medium text-white/40 mb-1">
          Nenhuma transacao
        </h3>
        <p className="text-xs text-white/20">
          As transacoes PIX aparecerao aqui
        </p>
      </motion.div>
    );
  }

  return (
    <div>
      {/* Table header */}
      <div className="hidden md:flex items-center gap-4 px-4 py-2 text-xs font-medium text-white/30 border-b border-white/5">
        <div className="w-40">Data</div>
        <div className="flex-1">Lead</div>
        <div className="w-28 text-right">Valor</div>
        <div className="w-28">Status</div>
        <div className="w-16" />
      </div>

      {/* Table rows */}
      {transactions.map((tx, index) => {
        const status = STATUS_MAP[tx.status] || STATUS_MAP.pending;
        return (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className={cn(
              'flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 px-4 py-3 border-b border-white/5',
              'hover:bg-white/[0.02] transition-colors'
            )}
          >
            {/* Date - full width on mobile */}
            <div className="md:w-40">
              <span className="text-xs text-white/50 md:hidden">Data: </span>
              <span className="text-xs text-white/50">
                {formatDateTime(tx.createdAt)}
              </span>
            </div>

            {/* Lead name */}
            <div className="flex-1 min-w-0">
              <span className="text-xs text-white/50 md:hidden">Lead: </span>
              <span className="text-sm text-white/80 truncate">
                {tx.leadName || '—'}
              </span>
            </div>

            {/* Amount */}
            <div className="md:w-28 md:text-right">
              <span className="text-xs text-white/50 md:hidden">Valor: </span>
              <span className="text-sm font-semibold text-emerald-400">
                {formatCurrency(tx.amount)}
              </span>
            </div>

            {/* Status */}
            <div className="md:w-28">
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>

            {/* Actions */}
            <div className="md:w-16 flex items-center">
              <button
                className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="View transaction details"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
