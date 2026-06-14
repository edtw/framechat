'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { extractList } from '@/lib/api-helpers';
import { motion } from 'framer-motion';
import {
  Plus,
  CreditCard,
  AlertCircle,
  Zap,
} from 'lucide-react';

interface VirtualCard {
  id: number;
  last4: string;
  cardholderName: string;
  status: 'ACTIVE' | 'FROZEN' | 'CANCELLED' | 'PENDING';
  spendingLimit?: number;
  spent?: number;
  expiry?: string;
  cardBrand?: string;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Ativo', cls: 'badge badge-success' },
  FROZEN: { label: 'Congelado', cls: 'badge badge-info' },
  CANCELLED: { label: 'Cancelado', cls: 'badge badge-error' },
  PENDING: { label: 'Pendente', cls: 'badge badge-warning' },
};

function CardDisplay({ card, onClick }: { card: VirtualCard; onClick: () => void }) {
  const spentPct = card.spendingLimit && card.spendingLimit > 0
    ? Math.min(100, ((card.spent || 0) / card.spendingLimit) * 100)
    : 0;

  const gradientColors = {
    ACTIVE: 'from-emerald-500/20 to-teal-500/20',
    FROZEN: 'from-blue-500/20 to-indigo-500/20',
    CANCELLED: 'from-red-500/10 to-gray-500/10',
    PENDING: 'from-amber-500/20 to-orange-500/20',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl p-5 border cursor-pointer transition-all overflow-hidden',
        'bg-gradient-to-br border-white/10',
        gradientColors[card.status] || gradientColors.PENDING,
        card.status === 'ACTIVE' && 'hover:border-emerald-500/30',
        card.status === 'FROZEN' && 'hover:border-blue-500/30',
      )}
    >
      {/* Card brand */}
      <div className="flex items-center justify-between mb-6">
        <CreditCard size={22} className="text-white/60" />
        <span className="text-[10px] uppercase tracking-widest text-white/40">{card.cardBrand || 'VISA'}</span>
      </div>

      {/* Card number */}
      <p className="text-lg font-mono tracking-widest text-white mb-4">
        •••• •••• •••• <span className="text-white">{card.last4}</span>
      </p>

      {/* Cardholder */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Titular</p>
          <p className="text-sm text-white font-medium">{card.cardholderName}</p>
        </div>
        <span className={cn(statusConfig[card.status]?.cls || 'badge', 'text-[10px]')}>
          {statusConfig[card.status]?.label || card.status}
        </span>
      </div>

      {/* Spending Progress */}
      {card.spendingLimit != null && card.spendingLimit > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-white/40">Gasto</span>
            <span className="text-white/60">
              {formatCurrency(card.spent || 0)} / {formatCurrency(card.spendingLimit)}
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                spentPct > 80 ? 'bg-red-500' : spentPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${spentPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Expiry */}
      {card.expiry && (
        <div className="mt-3">
          <p className="text-xs text-white/40">
            Validade: <span className="text-white/70">{card.expiry}</span>
          </p>
        </div>
      )}

      {/* Glow effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
    </motion.div>
  );
}

export default function VirtualCardsPage() {
  const router = useRouter();

  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/virtual-cards');
      setCards(extractList(data, 'cards') as VirtualCard[]);
    } catch {
      setError('Erro ao carregar cartoes virtuais.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Cartoes Virtuais</h1>
            <p className="text-sm text-white/40 mt-0.5">Gerencie cartoes virtuais para seus leads</p>
          </div>
          <button className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Emitir Cartao
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-52 rounded-2xl" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-20">
            <CreditCard size={40} className="text-white/20 mx-auto mb-4" />
            <p className="text-white/40 mb-4">Nenhum cartao virtual emitido.</p>
            <button className="btn-primary">Emitir Primeiro Cartao</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {cards.map((card) => (
              <CardDisplay key={card.id} card={card} onClick={() => router.push(`/virtual-cards/${card.id}`)} />
            ))}
          </div>
        )}
      </motion.div>
    
  );
}
