'use client';

import React from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CreditCard, Shield, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface VirtualCard {
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  status: 'active' | 'blocked' | 'expired';
  spendingLimit: number;
  spentAmount: number;
}

interface CardDisplayProps {
  card: VirtualCard;
}

const STATUS_MAP: Record<
  VirtualCard['status'],
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' }
> = {
  active: { label: 'Ativo', variant: 'success' },
  blocked: { label: 'Bloqueado', variant: 'error' },
  expired: { label: 'Expirado', variant: 'warning' },
};

export function CardDisplay({ card }: CardDisplayProps) {
  const spendingPercent =
    card.spendingLimit > 0
      ? Math.min((card.spentAmount / card.spendingLimit) * 100, 100)
      : 0;

  const status = STATUS_MAP[card.status];
  const formattedExpiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* Card background with glass effect */}
      <div className="relative bg-gradient-to-br from-gray-800 via-gray-900 to-black border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl">
        {/* Decorative gradient orb */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl" />

        <div className="relative z-10 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-semibold text-white/80">
                Cartao Virtual
              </span>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          {/* Card number */}
          <div>
            <p className="text-xs text-white/30 mb-1">Numero do cartao</p>
            <p className="text-xl font-mono font-bold text-white tracking-widest">
              •••• •••• •••• {card.last4}
            </p>
          </div>

          {/* Holder & Expiry */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white/30 mb-0.5">Titular</p>
              <p className="text-sm font-medium text-white/80 uppercase">
                {card.holderName}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/30 mb-0.5">Validade</p>
              <p className="text-sm font-medium text-white/80">
                {formattedExpiry}
              </p>
            </div>
          </div>

          {/* Spending progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/30">Limite utilizado</span>
              <span className="text-xs font-medium text-white/60">
                {formatCurrency(card.spentAmount)} /{' '}
                {formatCurrency(card.spendingLimit)}
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${spendingPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={cn(
                  'h-full rounded-full',
                  spendingPercent > 90
                    ? 'bg-red-400'
                    : spendingPercent > 70
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                )}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-white/20">
                {spendingPercent.toFixed(0)}% utilizado
              </span>
              <div className="flex items-center gap-1 text-[10px] text-white/20">
                <Lock className="w-2.5 h-2.5" />
                <Shield className="w-2.5 h-2.5" />
                Protegido
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
