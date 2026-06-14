'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import type { Session } from '@/types';
import { extractList } from '@/lib/api-helpers';
import StatsCard from '@/components/dashboard/StatsCard';
import SessionCard from '@/components/dashboard/SessionCard';
import Modal from '@/components/ui/Modal';
import { useAuthStore } from '@/stores/authStore';
import {
  MessageCircle, Plus, RefreshCw, QrCode, Loader2, AlertCircle,
} from 'lucide-react';

export default function WhatsAppPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrData, setQrData] = useState<{ qrCode?: string; sessionId?: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const operatorId = user?.operatorId;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/whatsapp/sessions');
      const list = extractList(data, 'sessions') as Session[];
      setSessions(list);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar sessoes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const handleCreateSession = async () => {
    setCreateLoading(true);
    setQrError(null);
    try {
      const sessionName = `WhatsApp - ${user?.name || 'Operador'} - ${new Date().toLocaleDateString('pt-BR')}`;
      const { data } = await api.post('/api/whatsapp/sessions', {
        name: sessionName,
        operatorId,
      });
      const sessionData = data.data || data.session || data;
      const sessionId = sessionData.sessionId || sessionData.id;

      // Clear any existing poll
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      // Poll for QR code
      setQrModalOpen(true);
      setQrLoading(true);
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        if (!mountedRef.current) {
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        try {
          const qrResp = await api.get(`/api/whatsapp/sessions/${sessionId}/qr`);
          const qr = qrResp.data?.qrCode || qrResp.data?.qrcode || qrResp.data?.qr || qrResp.data?.code;
          if (qr) {
            if (mountedRef.current) {
              setQrData({ qrCode: qr, sessionId });
              setQrLoading(false);
            }
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } catch {}
        attempts++;
        if (attempts > 30) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          if (mountedRef.current) {
            setQrLoading(false);
            setQrError('QR code timeout');
          }
        }
      }, 2000);
    } catch (err: any) {
      if (mountedRef.current) {
        setQrError(err.response?.data?.error || 'Erro ao criar sessao');
      }
    } finally {
      if (mountedRef.current) setCreateLoading(false);
    }
  };

  const handleShowQR = async (session: Session) => {
    const sid = session.sessionId || session.id;
    setQrModalOpen(true);
    setQrLoading(true);
    setQrError(null);
    try {
      const { data } = await api.get(`/api/whatsapp/sessions/${sid}/qr`);
      const qr = data?.qrCode || data?.qrcode || data?.qr || data?.code;
      if (qr) {
        setQrData({ qrCode: qr, sessionId: sid });
      } else {
        setQrError('QR code nao disponivel');
      }
    } catch {
      setQrError('Erro ao buscar QR code');
    } finally {
      setQrLoading(false);
    }
  };

  const handleDisconnect = async (session: Session) => {
    if (!confirm('Desconectar esta sessao WhatsApp?')) return;
    try {
      const sid = session.sessionId || session.id;
      await api.delete(`/api/whatsapp/sessions/${sid}`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao desconectar');
    }
  };

  const handleRefresh = () => load();

  const connectedCount = sessions.filter((s) => s.status === 'CONNECTED' || s.status === 'connected').length;
  const totalMessages = sessions.reduce((acc, s) => acc + (s.messageCount || 0), 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">WhatsApp</h1>
              <p className="text-sm text-white/40 mt-1">Gerencie suas sessoes WhatsApp</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleRefresh} className="btn-secondary flex items-center gap-2" disabled={loading}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Atualizar
              </button>
              <button onClick={handleCreateSession} disabled={createLoading} className="btn-primary flex items-center gap-2">
                {createLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Nova Sessao
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatsCard title="Sessoes Ativas" value={connectedCount} icon={MessageCircle} color="green" />
          <StatsCard title="Total Sessoes" value={sessions.length} icon={MessageCircle} color="blue" />
          <StatsCard title="Mensagens Hoje" value={totalMessages} icon={MessageCircle} color="purple" />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 mb-6">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Sessions Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-2xl" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-20">
            <MessageCircle size={48} className="text-white/20 mx-auto mb-4" />
            <p className="text-white/40 mb-4">Nenhuma sessao WhatsApp configurada.</p>
            <button onClick={handleCreateSession} className="btn-primary">
              Conectar Primeira Sessao
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s) => (
              <div
                key={s.id || s.sessionId}
                onClick={() => {
                  const sid = s.sessionId || s.id;
                  if (s.status === 'CONNECTED' || s.status === 'connected') {
                    router.push(`/whatsapp/${sid}`);
                  }
                }}
              >
                <SessionCard
                  session={{
                    sessionId: s.sessionId || s.id || '',
                    sessionName: s.sessionName || (s as any).name || 'Sessao',
                    status: (s.status?.toLowerCase() || 'disconnected') as Session['status'],
                    phoneNumber: s.phoneNumber,
                    lastActive: s.lastActive || s.updatedAt,
                    messageCount: s.messageCount,
                  }}
                  onShowQR={() => handleShowQR(s)}
                  onDelete={() => handleDisconnect(s)}
                  onToggleAI={() => {}}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      <Modal isOpen={qrModalOpen} onClose={() => { setQrModalOpen(false); setQrData(null); setQrError(null); }} title="QR Code - WhatsApp" size="md">
        <div className="flex flex-col items-center py-4">
          {qrLoading && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={40} className="animate-spin text-emerald-400" />
              <p className="text-white/60 text-sm">Gerando QR Code...</p>
              <p className="text-white/40 text-xs">Abra o WhatsApp no seu celular</p>
            </div>
          )}
          {qrError && (
            <div className="flex flex-col items-center gap-3">
              <AlertCircle size={40} className="text-red-400" />
              <p className="text-red-400 text-sm">{qrError}</p>
            </div>
          )}
          {qrData?.qrCode && !qrLoading && (
            <div className="flex flex-col items-center gap-4">
              <img src={qrData.qrCode} alt="QR Code" className="w-64 h-64 rounded-xl border border-white/10" />
              <p className="text-white/60 text-sm">Escaneie com o WhatsApp</p>
              <p className="text-white/40 text-xs">Sessao: {qrData.sessionId}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
