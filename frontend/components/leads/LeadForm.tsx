'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Phone,
  Hash,
  Building,
  FileText,
  Globe,
  DollarSign,
} from 'lucide-react';
import type { Lead, LeadSource, LeadPriority } from '@/types/lead';
import {
  LEAD_SOURCE_LABELS,
  LEAD_PRIORITY_LABELS,
} from '@/types/lead';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface LeadFormProps {
  initialData?: Partial<Lead>;
  onSubmit: (data: Partial<Lead>) => void;
  onCancel: () => void;
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
}

export function LeadForm({ initialData, onSubmit, onCancel }: LeadFormProps) {
  const [form, setForm] = useState<Partial<Lead>>({
    name: '',
    email: '',
    phone: '',
    cpf: '',
    company: '',
    value: undefined,
    description: '',
    source: 'whatsapp',
    priority: 'medium',
    ...initialData,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof Lead, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is edited
    if (field in errors) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.name?.trim()) {
      newErrors.name = 'Nome e obrigatorio';
    }
    if (!form.email?.trim()) {
      newErrors.email = 'Email e obrigatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Email invalido';
    }
    if (!form.phone?.trim()) {
      newErrors.phone = 'Telefone e obrigatorio';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Nome"
          icon={User}
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          error={errors.name}
          placeholder="Nome completo"
          required
        />
        <Input
          label="Email"
          icon={Mail}
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          error={errors.email}
          placeholder="email@exemplo.com"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Telefone"
          icon={Phone}
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          error={errors.phone}
          placeholder="(11) 99999-9999"
          required
        />
        <Input
          label="CPF"
          icon={Hash}
          value={form.cpf || ''}
          onChange={(e) => update('cpf', e.target.value)}
          placeholder="000.000.000-00"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Empresa"
          icon={Building}
          value={form.company || ''}
          onChange={(e) => update('company', e.target.value)}
          placeholder="Nome da empresa"
        />
        <Input
          label="Valor (R$)"
          icon={DollarSign}
          type="number"
          value={form.value != null ? String(form.value) : ''}
          onChange={(e) =>
            update('value', e.target.value ? parseFloat(e.target.value) : undefined)
          }
          placeholder="0,00"
        />
      </div>

      {/* Source select */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1.5">
          Origem
        </label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <select
            value={form.source}
            onChange={(e) => update('source', e.target.value as LeadSource)}
            className={cn(
              'w-full bg-white/[0.05] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white',
              'focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30',
              'transition-colors backdrop-blur-sm appearance-none'
            )}
          >
            {(
              Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]
            ).map((s) => (
              <option key={s} value={s} className="bg-gray-900 text-white">
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Priority select */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1.5">
          Prioridade
        </label>
        <select
          value={form.priority}
          onChange={(e) => update('priority', e.target.value as LeadPriority)}
          className={cn(
            'w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white',
            'focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30',
            'transition-colors backdrop-blur-sm appearance-none'
          )}
        >
          {(Object.keys(LEAD_PRIORITY_LABELS) as LeadPriority[]).map(
            (p) => (
              <option key={p} value={p} className="bg-gray-900 text-white">
                {LEAD_PRIORITY_LABELS[p]}
              </option>
            )
          )}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1.5">
          Descricao
        </label>
        <textarea
          value={form.description || ''}
          onChange={(e) => update('description', e.target.value)}
          rows={3}
          placeholder="Detalhes adicionais sobre o lead..."
          className={cn(
            'w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30',
            'focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30',
            'transition-colors backdrop-blur-sm resize-none'
          )}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={submitting}>
          Salvar Lead
        </Button>
        <Button variant="ghost" onClick={onCancel} type="button">
          Cancelar
        </Button>
      </div>
    </motion.form>
  );
}
