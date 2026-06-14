'use client';

import React from 'react';
import { cn, formatCurrency, timeAgo } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { Lead, LeadPriority } from '@/types/lead';
import { LEAD_PRIORITY_LABELS, LEAD_PRIORITY_COLORS } from '@/types/lead';
import { Badge } from '@/components/ui/Badge';

interface LeadCardProps {
  lead: Lead;
  onClick?: (lead: Lead) => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const priorityVariant = LEAD_PRIORITY_COLORS[lead.priority] as
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'purple';

  const visibleTags = (lead.tags || []).slice(0, 2);
  const extraTagCount = (lead.tags || []).length - 2;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        'bg-white/[0.03] border border-white/10 rounded-xl p-4 cursor-pointer backdrop-blur-xl',
        'hover:border-emerald-500/30 hover:bg-white/[0.05] transition-colors',
        isDragging && 'shadow-2xl shadow-emerald-500/10 border-emerald-500/50'
      )}
      onClick={() => onClick?.(lead)}
    >
      {/* Drag handle + header */}
      <div className="flex items-start gap-2 mb-3">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-0.5 rounded text-white/20 hover:text-white/50 transition-colors cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white truncate">
            {lead.name}
          </h4>
          <p className="text-xs text-white/40 truncate mt-0.5">{lead.email}</p>
        </div>

        <Badge variant={priorityVariant} className="flex-shrink-0">
          {LEAD_PRIORITY_LABELS[lead.priority]}
        </Badge>
      </div>

      {/* Phone */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-white/40 truncate">
          {lead.phone || 'Sem telefone'}
        </span>
      </div>

      {/* Value */}
      {lead.value != null && lead.value > 0 && (
        <div className="mb-2">
          <span className="text-sm font-semibold text-emerald-400">
            {formatCurrency(lead.value)}
          </span>
        </div>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-white/50 border border-white/10"
            >
              {tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span className="text-[10px] text-white/30">
              +{extraTagCount}
            </span>
          )}
        </div>
      )}

      {/* Last contact */}
      {lead.lastContactAt && (
        <div className="text-[10px] text-white/30 mt-1">
          Ultimo contato: {timeAgo(lead.lastContactAt)}
        </div>
      )}
    </motion.div>
  );
}
