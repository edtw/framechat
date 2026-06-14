'use client';

import { useState, useCallback } from 'react';
import api from '@/lib/api';
import type { Lead, LeadStatus } from '@/stores/leadStore';

interface LeadFilters {
  search?: string;
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

export function useLeadApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = useCallback(async (filters: LeadFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/crm/leads', { params: filters });
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch leads');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLeadById = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/api/crm/leads/${id}`);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch lead');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createLead = useCallback(async (payload: Partial<Lead>) => {
    setError(null);
    try {
      const { data } = await api.post('/api/crm/leads', payload);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create lead');
      throw err;
    }
  }, []);

  const updateLead = useCallback(async (id: number, payload: Partial<Lead>) => {
    setError(null);
    try {
      const { data } = await api.put(`/api/crm/leads/${id}`, payload);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update lead');
      throw err;
    }
  }, []);

  const updateLeadStatus = useCallback(async (id: number, status: LeadStatus) => {
    setError(null);
    try {
      const { data } = await api.patch(`/api/crm/leads/${id}/status`, { status });
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update lead status');
      throw err;
    }
  }, []);

  const fetchLeadStats = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get('/api/crm/leads/stats');
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch stats');
      throw err;
    }
  }, []);

  return {
    loading,
    error,
    fetchLeads,
    fetchLeadById,
    createLead,
    updateLead,
    updateLeadStatus,
    fetchLeadStats,
  };
}
