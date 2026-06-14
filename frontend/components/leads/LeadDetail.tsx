'use client';

import React, { useState } from 'react';
import { cn, formatCurrency, formatDateTime, formatPhone } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Edit3,
  Check,
  Mail,
  Phone,
  User,
  Building,
  FileText,
  Hash,
  Calendar,
  Tag,
  DollarSign,
} from 'lucide-react';
import type { Lead } from '@/types/lead';
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_SOURCE_LABELS,
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_COLORS,
} from '@/types/lead';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface LeadDetailProps {
  lead: Lead;
  onClose: () => void;
  onUpdate: (lead: Lead) => void;
}

type DetailTab = 'info' | 'history' | 'documents';

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'info', label: 'Informacoes' },
  { key: 'history', label: 'Historico' },
  { key: 'documents', label: 'Documentos' },
];

export function LeadDetail({ lead, onClose, onUpdate }: LeadDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [editedLead, setEditedLead] = useState<Lead>({ ...lead });
  const [saving, setSaving] = useState(false);

  const statusColors = LEAD_STATUS_COLORS[lead.status];
  const priorityVariant = LEAD_PRIORITY_COLORS[lead.priority] as
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'purple';

  const handleSave = async () => {
    setSaving(true);
    try {
      onUpdate(editedLead);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedLead({ ...lead });
    setIsEditing(false);
  };

  const updateField = (field: keyof Lead, value: string | number) => {
    setEditedLead((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 35 }}
      className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-black/95 backdrop-blur-xl border-l border-white/10 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white truncate">
          {lead.name}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            aria-label={isEditing ? 'Cancel editing' : 'Edit lead'}
          >
            {isEditing ? (
              <Check className="w-4 h-4" />
            ) : (
              <Edit3 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Status + priority row */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-white/5">
        <Badge variant={statusColors.badge}>
          {LEAD_STATUS_LABELS[lead.status]}
        </Badge>
        <Badge variant={priorityVariant}>
          {LEAD_PRIORITY_LABELS[lead.priority]}
        </Badge>
        <Badge variant="info">{LEAD_SOURCE_LABELS[lead.source]}</Badge>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative',
              activeTab === tab.key
                ? 'text-emerald-400'
                : 'text-white/40 hover:text-white/70'
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <motion.div
                layoutId="active-tab"
                className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-emerald-400 rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {activeTab === 'info' && (
          <div className="space-y-4">
            {/* Name */}
            <InfoField
              icon={User}
              label="Nome"
              value={lead.name}
              editing={isEditing}
              editValue={editedLead.name}
              onChange={(v) => updateField('name', v)}
            />

            {/* Email */}
            <InfoField
              icon={Mail}
              label="Email"
              value={lead.email}
              editing={isEditing}
              editValue={editedLead.email}
              onChange={(v) => updateField('email', v)}
            />

            {/* Phone */}
            <InfoField
              icon={Phone}
              label="Telefone"
              value={formatPhone(lead.phone)}
              editing={isEditing}
              editValue={editedLead.phone}
              onChange={(v) => updateField('phone', v)}
            />

            {/* CPF */}
            {lead.cpf && (
              <InfoField
                icon={Hash}
                label="CPF"
                value={lead.cpf}
                editing={isEditing}
                editValue={editedLead.cpf || ''}
                onChange={(v) => updateField('cpf', v)}
              />
            )}

            {/* Company */}
            <InfoField
              icon={Building}
              label="Empresa"
              value={lead.company || '—'}
              editing={isEditing}
              editValue={editedLead.company || ''}
              onChange={(v) => updateField('company', v)}
            />

            {/* Value */}
            <InfoField
              icon={DollarSign}
              label="Valor"
              value={lead.value != null ? formatCurrency(lead.value) : '—'}
              editing={isEditing}
              editValue={String(editedLead.value || '')}
              onChange={(v) => updateField('value', parseFloat(v) || 0)}
            />

            {/* Description */}
            <InfoField
              icon={FileText}
              label="Descricao"
              value={lead.description || '—'}
              editing={isEditing}
              editValue={editedLead.description || ''}
              onChange={(v) => updateField('description', v)}
              multiline
            />

            {/* Tags */}
            {lead.tags && lead.tags.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-white/40 mb-2">
                  <Tag className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Tags</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {lead.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-xs bg-white/5 text-white/50 border border-white/10"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="pt-2 space-y-1 border-t border-white/5">
              <div className="flex items-center gap-2 text-xs text-white/30">
                <Calendar className="w-3 h-3" />
                Criado: {formatDateTime(lead.createdAt)}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/30">
                <Calendar className="w-3 h-3" />
                Atualizado: {formatDateTime(lead.updatedAt)}
              </div>
            </div>

            {/* Edit actions */}
            {isEditing && (
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <Button onClick={handleSave} loading={saving} size="sm">
                  Salvar
                </Button>
                <Button variant="ghost" onClick={handleCancel} size="sm">
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex flex-col items-center justify-center py-12 text-white/30">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Historico em breve</p>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="flex flex-col items-center justify-center py-12 text-white/30">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Documentos em breve</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Helper component for info fields
interface InfoFieldProps {
  icon: React.ElementType;
  label: string;
  value: string;
  editing: boolean;
  editValue: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}

function InfoField({
  icon: Icon,
  label,
  value,
  editing,
  editValue,
  onChange,
  multiline,
}: InfoFieldProps) {
  return (
    <div>
      <div className="flex items-center gap-2 text-white/40 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      {editing ? (
        <Input
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full"
        />
      ) : (
        <p className="text-sm text-white/80">{value}</p>
      )}
    </div>
  );
}
