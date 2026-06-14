export type LeadStatus =
  | 'NOVO'
  | 'CONTATO'
  | 'QUALIFICADO'
  | 'PROPOSTA'
  | 'FECHADO'
  | 'PERDIDO';

export type LeadSource =
  | 'whatsapp'
  | 'referral'
  | 'google'
  | 'instagram'
  | 'other';

export type LeadPriority = 'low' | 'medium' | 'high';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  company?: string;
  value?: number;
  status: LeadStatus;
  priority: LeadPriority;
  source: LeadSource;
  description?: string;
  tags?: string[];
  lastContactAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NOVO: 'Novo',
  CONTATO: 'Contato',
  QUALIFICADO: 'Qualificado',
  PROPOSTA: 'Proposta',
  FECHADO: 'Fechado',
  PERDIDO: 'Perdido',
};

export const LEAD_STATUS_COLORS: Record<
  LeadStatus,
  { dot: string; badge: 'success' | 'warning' | 'error' | 'info' | 'purple' }
> = {
  NOVO: { dot: 'bg-blue-400', badge: 'info' },
  CONTATO: { dot: 'bg-amber-400', badge: 'warning' },
  QUALIFICADO: { dot: 'bg-purple-400', badge: 'purple' },
  PROPOSTA: { dot: 'bg-emerald-400', badge: 'success' },
  FECHADO: { dot: 'bg-emerald-500', badge: 'success' },
  PERDIDO: { dot: 'bg-red-400', badge: 'error' },
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  whatsapp: 'WhatsApp',
  referral: 'Indicacao',
  google: 'Google',
  instagram: 'Instagram',
  other: 'Outro',
};

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
};

export const LEAD_PRIORITY_COLORS: Record<
  LeadPriority,
  'success' | 'warning' | 'error' | 'info' | 'purple'
> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
};
