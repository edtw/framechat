import { Session } from "@/types";
import { formatTime } from "@/lib/utils";
import { QrCode, Trash2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionCardProps {
  session: Session;
  onShowQR: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onToggleAI?: (sessionId: string, enabled: boolean) => void;
}

const statusConfig: Record<
  Session["status"] | "default",
  { label: string; className: string }
> = {
  connected: {
    label: "Conectado",
    className: "bg-emerald-500/15 text-emerald-200",
  },
  disconnected: {
    label: "Desconectado",
    className: "bg-rose-500/15 text-rose-200",
  },
  connecting: {
    label: "Conectando",
    className: "bg-amber-500/15 text-amber-100",
  },
  reconnecting: {
    label: "Reconectando",
    className: "bg-amber-500/15 text-amber-100",
  },
  qr_ready: {
    label: "QR disponivel",
    className: "bg-sky-500/15 text-sky-100",
  },
  error: {
    label: "Erro",
    className: "bg-rose-500/15 text-rose-200",
  },
  default: {
    label: "Indefinido",
    className: "bg-white/10 text-white/70",
  },
};

export default function SessionCard({ session, onShowQR, onDelete, onToggleAI }: SessionCardProps) {
  const status = statusConfig[session.status] || statusConfig.default;
  const qrDisabled = session.status === "connected";

  return (
    <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-medium text-white">{session.sessionName || session.sessionId}</p>
          <p className="text-xs text-white/50">ID: {session.sessionId}</p>
        </div>
        <div className="flex items-center gap-2">
          {onToggleAI && (
            <button
              onClick={() => onToggleAI(session.sessionId, !session.aiEnabled)}
              className={cn(
                "rounded-2xl border border-white/10 p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50",
                session.aiEnabled ? "text-emerald-400" : "text-white/40"
              )}
              aria-label={session.aiEnabled ? "Desabilitar IA" : "Habilitar IA"}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <span className={cn("rounded-full px-3 py-1 text-xs font-medium", status.className)}>
            {status.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5 my-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50 mb-1">Mensagens</p>
          <p className="text-xl font-semibold text-white">{session.messageCount || 0}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50 mb-1">Ultima atividade</p>
          <p className="text-xl font-semibold text-white">{formatTime(session.lastActive || '')}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onShowQR(session.sessionId)}
          className={cn(
            "flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black shadow-lg shadow-white/20 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50",
            qrDisabled && "cursor-not-allowed opacity-40"
          )}
          aria-label={`Mostrar QR Code para ${session.sessionName || session.sessionId}`}
          disabled={qrDisabled}
        >
          <div className="flex items-center justify-center gap-2">
            <QrCode className="h-4 w-4" aria-hidden="true" />
            <span>QR Code</span>
          </div>
        </button>
        <button
          onClick={() => onDelete(session.sessionId)}
          className="rounded-2xl border border-white/10 px-3 py-3 text-rose-200 hover:border-rose-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
          aria-label={`Deletar sessao ${session.sessionName || session.sessionId}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
