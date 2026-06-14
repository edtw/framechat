'use client';

import { create } from 'zustand';

export interface Lead {
  id: number;
  operatorId: number;
  name: string;
  company?: string;
  email: string;
  phone: string;
  cpf?: string;
  value?: number;
  description?: string;
  status: LeadStatus;
  priority: Priority;
  score?: number;
  source?: string;
  lastContact?: string;
  tags?: Tag[];
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface LeadFilters {
  search?: string;
  status?: LeadStatus | 'ALL';
  priority?: Priority | 'ALL';
  source?: string;
}

interface LeadState {
  leads: Lead[];
  selectedLead: Lead | null;
  filters: LeadFilters;
  loading: boolean;
  error: string | null;

  setLeads: (leads: Lead[]) => void;
  setSelectedLead: (lead: Lead | null) => void;
  updateLeadStatus: (id: number, status: LeadStatus) => void;
  setFilters: (filters: LeadFilters) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addLead: (lead: Lead) => void;
  removeLead: (id: number) => void;
}

export const useLeadStore = create<LeadState>()((set) => ({
  leads: [],
  selectedLead: null,
  filters: { status: 'ALL', priority: 'ALL' },
  loading: false,
  error: null,

  setLeads: (leads) => set({ leads, loading: false }),
  setSelectedLead: (lead) => set({ selectedLead: lead }),
  updateLeadStatus: (id, status) =>
    set((state) => ({
      leads: state.leads.map((l) => (l.id === id ? { ...l, status } : l)),
      selectedLead: state.selectedLead?.id === id ? { ...state.selectedLead, status } : state.selectedLead,
    })),
  setFilters: (filters) => set({ filters }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  addLead: (lead) => set((state) => ({ leads: [lead, ...state.leads] })),
  removeLead: (id) =>
    set((state) => ({
      leads: state.leads.filter((l) => l.id !== id),
      selectedLead: state.selectedLead?.id === id ? null : state.selectedLead,
    })),
}));
