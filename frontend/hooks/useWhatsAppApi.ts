'use client';

import { useState, useCallback } from 'react';
import api from '@/lib/api';

export function useWhatsAppApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/whatsapp/sessions');
      return data.sessions || data.data || data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch sessions');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createSession = useCallback(async (name: string) => {
    setError(null);
    try {
      const { data } = await api.post('/api/whatsapp/sessions', { name });
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create session');
      throw err;
    }
  }, []);

  const getQRCode = useCallback(async (sessionId: string) => {
    setError(null);
    try {
      const { data } = await api.get(`/api/whatsapp/sessions/${sessionId}/qr`);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to get QR code');
      throw err;
    }
  }, []);

  const disconnectSession = useCallback(async (sessionId: string) => {
    setError(null);
    try {
      const { data } = await api.delete(`/api/whatsapp/sessions/${sessionId}`);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to disconnect session');
      throw err;
    }
  }, []);

  const fetchConversations = useCallback(async (_sessionId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/whatsapp/conversations');
      return data.conversations || data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch conversations');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setError(null);
    try {
      const { data } = await api.get('/api/whatsapp/messages', {
        params: { conversationId },
      });
      return data.messages || data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch messages');
      throw err;
    }
  }, []);

  const sendMessage = useCallback(async (sessionId: string, userPhone: string, message: string) => {
    setError(null);
    try {
      const { data } = await api.post('/api/whatsapp/conversations/send-message', {
        sessionId,
        userPhone,
        message,
      });
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send message');
      throw err;
    }
  }, []);

  const takeOver = useCallback(async (sessionId: string, userPhone: string) => {
    setError(null);
    try {
      const { data } = await api.post('/api/whatsapp/conversations/takeover', {
        sessionId,
        userPhone,
      });
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to take over conversation');
      throw err;
    }
  }, []);

  const returnToAI = useCallback(async (sessionId: string, userPhone: string) => {
    setError(null);
    try {
      const { data } = await api.post('/api/whatsapp/conversations/return-to-ai', {
        sessionId,
        userPhone,
      });
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to return conversation to AI');
      throw err;
    }
  }, []);

  const checkTakeoverStatus = useCallback(async (sessionId: string, userPhone: string) => {
    setError(null);
    try {
      const { data } = await api.get(`/api/whatsapp/conversations/takeover-status/${sessionId}/${userPhone}`);
      return {
        isTakenOver: data.is_taken_over || data.isTakenOver || false,
        takenOverBy: data.taken_over_by || data.takenOverBy || null,
      };
    } catch {
      return { isTakenOver: false, takenOverBy: null };
    }
  }, []);

  return {
    loading,
    error,
    fetchSessions,
    createSession,
    getQRCode,
    disconnectSession,
    fetchConversations,
    fetchMessages,
    sendMessage,
    takeOver,
    returnToAI,
    checkTakeoverStatus,
  };
}
