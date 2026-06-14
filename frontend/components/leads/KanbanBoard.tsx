'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Lead, LeadStatus } from '@/types/lead';
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
} from '@/types/lead';
import { LeadCard } from './LeadCard';

interface KanbanBoardProps {
  leads: Lead[];
  onStatusChange: (leadId: string, newStatus: LeadStatus) => void;
}

const COLUMNS: LeadStatus[] = [
  'NOVO',
  'CONTATO',
  'QUALIFICADO',
  'PROPOSTA',
  'FECHADO',
  'PERDIDO',
];

export function KanbanBoard({ leads, onStatusChange }: KanbanBoardProps) {
  const [activeLead, setActiveLead] = React.useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Group leads by status
  const columnLeads = useMemo(() => {
    const grouped: Record<LeadStatus, Lead[]> = {
      NOVO: [],
      CONTATO: [],
      QUALIFICADO: [],
      PROPOSTA: [],
      FECHADO: [],
      PERDIDO: [],
    };
    leads.forEach((lead) => {
      if (grouped[lead.status]) {
        grouped[lead.status].push(lead);
      }
    });
    return grouped;
  }, [leads]);

  const handleDragStart = (event: DragStartEvent) => {
    const leadId = event.active.id as string;
    const found = leads.find((l) => l.id === leadId);
    setActiveLead(found || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLead(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // If dropped on a column container (not on another card)
    if (COLUMNS.includes(overId as LeadStatus)) {
      const lead = leads.find((l) => l.id === activeId);
      if (lead && lead.status !== overId) {
        onStatusChange(activeId, overId as LeadStatus);
      }
      return;
    }

    // If dropped on another card, move to that card's column
    const overLead = leads.find((l) => l.id === overId);
    if (overLead) {
      const activeLead = leads.find((l) => l.id === activeId);
      if (activeLead && activeLead.status !== overLead.status) {
        onStatusChange(activeId, overLead.status);
      }
    }
  };

  const handleCardClick = (lead: Lead) => {
    // Navigation handled by parent or routing
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 h-full">
        {COLUMNS.map((status) => {
          const leadsInColumn = columnLeads[status];
          const colors = LEAD_STATUS_COLORS[status];

          return (
            <div
              key={status}
              className="flex-shrink-0 w-72 flex flex-col bg-white/[0.01] border border-white/5 rounded-2xl"
              data-column={status}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${colors.dot}`}
                  />
                  <h3 className="text-sm font-semibold text-white/80">
                    {LEAD_STATUS_LABELS[status]}
                  </h3>
                </div>
                <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                  {leadsInColumn.length}
                </span>
              </div>

              {/* Column body */}
              <SortableContext
                items={leadsInColumn.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex-1 p-3 space-y-2 min-h-[100px] overflow-y-auto">
                  {leadsInColumn.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center py-8 text-xs text-white/20"
                    >
                      Nenhum lead
                    </motion.div>
                  ) : (
                    leadsInColumn.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        onClick={handleCardClick}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeLead && (
          <div className="w-72 opacity-90">
            <LeadCard lead={activeLead} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
