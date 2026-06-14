'use client';

import React, { useState, useMemo } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CreditCard, User, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { Lead } from '@/types/lead';

interface CardIssueFormProps {
  onSubmit: (data: CardIssueData) => void;
  leads: Lead[];
}

export interface CardIssueData {
  leadId: string;
  spendingLimit: number;
  holderName: string;
}

export function CardIssueForm({ onSubmit, leads }: CardIssueFormProps) {
  const [form, setForm] = useState<CardIssueData>({
    leadId: '',
    spendingLimit: 0,
    holderName: '',
  });
  const [leadSearch, setLeadSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    if (!leadSearch.trim()) return leads.slice(0, 5);
    const q = leadSearch.toLowerCase();
    return leads
      .filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [leads, leadSearch]);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === form.leadId),
    [leads, form.leadId]
  );

  const update = (field: keyof CardIssueData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSelectLead = (lead: Lead) => {
    setForm({
      leadId: lead.id,
      spendingLimit: form.spendingLimit,
      holderName: lead.name,
    });
    setLeadSearch(lead.name);
    setShowSuggestions(false);
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.leadId) {
      setError('Selecione um lead');
      return;
    }
    if (!form.spendingLimit || form.spendingLimit <= 0) {
      setError('Informe um limite de gastos valido');
      return;
    }
    if (!form.holderName.trim()) {
      setError('Informe o nome do titular');
      return;
    }

    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(form));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      {/* Lead selector */}
      <div className="relative">
        <label className="block text-sm font-medium text-white/70 mb-1.5">
          Lead
        </label>
        <Input
          icon={User}
          value={leadSearch}
          onChange={(e) => {
            setLeadSearch(e.target.value);
            setShowSuggestions(true);
            if (!e.target.value) {
              update('leadId', '');
              update('holderName', '');
            }
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={handleBlur}
          placeholder="Buscar lead por nome ou email..."
        />

        {/* Suggestions dropdown */}
        {showSuggestions && leadSearch && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-black/95 border border-white/10 rounded-xl backdrop-blur-xl shadow-xl overflow-hidden">
            {filteredLeads.length === 0 ? (
              <div className="px-4 py-3 text-xs text-white/30">
                Nenhum lead encontrado
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => handleSelectLead(lead)}
                  className={cn(
                    'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors hover:bg-white/5',
                    lead.id === form.leadId && 'bg-emerald-500/10'
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-white">
                      {lead.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm text-white truncate">{lead.name}</p>
                    <p className="text-xs text-white/30 truncate">
                      {lead.email}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected lead info */}
      {selectedLead && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center">
            <span className="text-xs font-bold text-white">
              {selectedLead.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {selectedLead.name}
            </p>
            <p className="text-xs text-white/40">{selectedLead.email}</p>
          </div>
        </motion.div>
      )}

      {/* Spending limit */}
      <Input
        label="Limite de Gastos (R$)"
        icon={DollarSign}
        type="number"
        step="0.01"
        min="0.01"
        value={form.spendingLimit > 0 ? String(form.spendingLimit) : ''}
        onChange={(e) =>
          update(
            'spendingLimit',
            e.target.value ? parseFloat(e.target.value) : 0
          )
        }
        placeholder="5000,00"
      />

      {/* Holder name (auto-filled from lead) */}
      <Input
        label="Nome do Titular"
        icon={CreditCard}
        value={form.holderName}
        onChange={(e) => update('holderName', e.target.value)}
        placeholder="Nome como aparecera no cartao"
      />

      {/* Error */}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-red-400"
        >
          {error}
        </motion.p>
      )}

      {/* Submit */}
      <Button type="submit" loading={submitting} className="w-full">
        <CreditCard className="w-4 h-4 mr-2" />
        Emitir Cartao Virtual
      </Button>
    </motion.form>
  );
}
