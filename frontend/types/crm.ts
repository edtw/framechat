export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface Lead {
  id: number;
  name: string;
  company?: string | null;
  email?: string | null;
  phone: string;
  stage: LeadStage;
  score?: number | null;
  owner?: string | null;
  lastActivity?: string | null;
  tags?: string[];
  updatedAt?: string;
  source?: string | null;
}

export interface StageColumn {
  id: LeadStage;
  title: string;
  leads: Lead[];
}

export interface FollowUpTask {
  id: number;
  leadId: number;
  content: string;
  dueDate?: string | null;
  status?: 'pending' | 'done' | string;
  createdAt?: string;
}

export interface CRMContact {
  id?: number;
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  lifecycle_stage?: string | null;
  lead_score?: number | null;
}

export interface AIInsight {
  id: string;
  leadId: number;
  summary: string;
  confidence: number;
  createdAt: string;
}
