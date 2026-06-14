'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { extractList } from '@/lib/api-helpers';
import { cn } from '@/lib/utils';
import type { DiscordQueueItem } from '@/types/discord';
import {
  Hash,
  ArrowLeft,
  Check,
  X,
  Loader2,
  Inbox,
  AlertTriangle,
  RefreshCw,
  Gauge,
  MessageSquareQuote,
} from 'lucide-react';

function scoreColor(score?: number | null) {
  if (score == null) return '#80848e';
  if (score >= 0.7) return '#23a55a';
  if (score >= 0.4) return '#f0b232';
  return '#f23f43';
}

export default function DiscordQueuePage() {
  const router = useRouter();

  const [items, setItems] = useState<DiscordQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Per-item local edits of the proposed message + busy state.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/discord/queue', {
        params: { status: 'PENDING' },
      });
      const list = extractList(data, 'items') as DiscordQueueItem[];
      setItems(list);
      // Seed drafts with proposed messages (don't clobber unsaved edits).
      setDrafts((prev) => {
        const next = { ...prev };
        for (const it of list) {
          if (!(it.id in next)) next[it.id] = it.proposedMessage || '';
        }
        return next;
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar a fila de engajamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (
    item: DiscordQueueItem,
    action: 'approve' | 'reject'
  ) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      if (action === 'approve') {
        await api.post(`/api/discord/queue/${item.id}/review`, {
          action: 'approve',
          proposedMessage: drafts[item.id] ?? item.proposedMessage ?? '',
        });
        setNotice('Mensagem aprovada e enviada para publicação.');
      } else {
        const rejectionReason =
          window.prompt('Motivo da rejeição (opcional):', '') || undefined;
        await api.post(`/api/discord/queue/${item.id}/review`, {
          action: 'reject',
          rejectionReason,
        });
        setNotice('Mensagem rejeitada.');
      }
      await load();
    } catch (err: any) {
      setNotice(err.response?.data?.error || 'Erro ao processar a revisão');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#313338] text-[#dbdee1]">
      {/* Guild rail */}
      <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-[#1e1f22] py-3">
        <button
          onClick={() => router.push('/discord')}
          title="Voltar às contas"
          className="group flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#dbdee1] transition-all hover:rounded-[16px] hover:bg-[#5865F2] hover:text-white"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="h-[2px] w-8 rounded-full bg-[#35363c]" />
        <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#5865F2] text-white">
          <Inbox className="h-6 w-6" />
        </div>
      </div>

      {/* Sidebar */}
      <div className="flex w-60 shrink-0 flex-col bg-[#2b2d31]">
        <div className="flex h-12 items-center px-4 shadow-[0_1px_0_rgba(0,0,0,0.2)]">
          <span className="truncate font-semibold text-white">Engajamento</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
            Fila
          </p>
          <div className="flex items-center gap-1.5 rounded bg-[#404249] px-2 py-1.5 text-[15px] text-white">
            <Hash className="h-5 w-5 shrink-0 text-[#80848e]" />
            <span className="truncate">aprovações</span>
            <span className="ml-auto rounded-full bg-[#5865F2] px-1.5 text-[11px] font-semibold text-white">
              {items.length}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#26272b] px-4 shadow-[0_1px_0_rgba(0,0,0,0.1)]">
          <Hash className="h-6 w-6 text-[#80848e]" />
          <span className="font-semibold text-white">aprovações</span>
          <div className="mx-3 h-6 w-px bg-[#3f4147]" />
          <span className="truncate text-sm text-[#949ba4]">
            Revisão humana antes de publicar no Discord
          </span>
          <button
            onClick={load}
            disabled={loading}
            title="Atualizar"
            className="ml-auto flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1] disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {notice && (
            <div className="mb-4 rounded-md bg-[#5865F2]/15 px-4 py-2 text-sm text-[#c9cdfb]">
              {notice}
            </div>
          )}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-[#f23f43]/15 px-4 py-2 text-sm text-[#fca5a5]">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-[#949ba4]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando fila…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-[#949ba4]">
              <Inbox className="h-12 w-12 text-[#3f4147]" />
              <p className="text-lg font-semibold text-[#dbdee1]">Nada para revisar</p>
              <p className="text-sm">
                Não há mensagens de engajamento pendentes de aprovação.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {items.map((item) => {
                const busy = busyId === item.id;
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[#26272b] bg-[#2b2d31] p-4"
                  >
                    {/* server / channel header */}
                    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-semibold text-white">
                        {item.guildName || 'Servidor desconhecido'}
                      </span>
                      <span className="flex items-center text-[#949ba4]">
                        <Hash className="h-4 w-4" />
                        {item.channelName || 'canal'}
                      </span>
                      {item.relevanceScore != null && (
                        <span
                          className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                          style={{
                            color: scoreColor(item.relevanceScore),
                            backgroundColor: `${scoreColor(item.relevanceScore)}22`,
                          }}
                          title="Relevância"
                        >
                          <Gauge className="h-3.5 w-3.5" />
                          {Math.round((item.relevanceScore || 0) * 100)}%
                        </span>
                      )}
                    </div>

                    {/* trigger context */}
                    {item.triggerContext && (
                      <div className="mb-3 rounded-md border-l-2 border-[#5865F2] bg-[#1e1f22] px-3 py-2">
                        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                          <MessageSquareQuote className="h-3.5 w-3.5" /> Contexto
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-[#dbdee1]">
                          {item.triggerContext}
                        </p>
                      </div>
                    )}

                    {/* editable proposed message */}
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                      Mensagem proposta pela IA (editável)
                    </label>
                    <textarea
                      value={drafts[item.id] ?? item.proposedMessage ?? ''}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      rows={4}
                      className="w-full resize-y rounded border border-[#1e1f22] bg-[#383a40] px-3 py-2.5 text-[15px] leading-relaxed text-[#dbdee1] outline-none focus:border-[#5865F2]"
                    />

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        onClick={() => review(item, 'reject')}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded bg-[#404249] px-4 py-2 text-sm font-medium text-[#dbdee1] hover:bg-[#f23f43] hover:text-white disabled:opacity-60"
                      >
                        <X className="h-4 w-4" /> Rejeitar
                      </button>
                      <button
                        onClick={() => review(item, 'approve')}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded bg-[#23a55a] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e9150] disabled:opacity-60"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Aprovar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
