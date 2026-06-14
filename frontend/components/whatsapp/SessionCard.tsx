'use client';

import React from 'react';
import { cn, timeAgo } from '@/lib/utils';
import { motion } from 'framer-motion';
import { QrCode, Power, Smartphone, MessageSquare } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Button } from '@/components/ui/Button';

interface WhatsAppSession {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'connecting';
  phoneNumber?: string;
  messageCount: number;
  lastActivity?: string;
}

interface SessionCardProps {
  session: WhatsAppSession;
  onQR?: (session: WhatsAppSession) => void;
  onDisconnect?: (session: WhatsAppSession) => void;
  onClick?: (session: WhatsAppSession) => void;
}

export function SessionCard({
  session,
  onQR,
  onDisconnect,
  onClick,
}: SessionCardProps) {
  const statusLabel: Record<string, string> = {
    online: 'Conectado',
    offline: 'Desconectado',
    connecting: 'Conectando...',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white/[0.03] border border-white/10 rounded-2xl p-5 backdrop-blur-xl',
        'hover:border-emerald-500/20 hover:bg-white/[0.04] transition-all'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <button
          onClick={() => onClick?.(session)}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex items-center gap-2 mb-1">
            <StatusDot status={session.status} />
            <h3 className="text-sm font-semibold text-white truncate">
              {session.name}
            </h3>
          </div>
          <p className="text-xs text-white/40 ml-[18px]">
            {statusLabel[session.status]}
          </p>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {onQR && (
            <Button
              variant="ghost"
              size="sm"
              icon={QrCode}
              onClick={() => onQR(session)}
              className="text-white/40 hover:text-white"
              aria-label="Show QR Code"
            />
          )}
          {onDisconnect && session.status === 'online' && (
            <Button
              variant="ghost"
              size="sm"
              icon={Power}
              onClick={() => onDisconnect(session)}
              className="text-white/40 hover:text-red-400"
              aria-label="Disconnect session"
            />
          )}
        </div>
      </div>

      {/* Phone */}
      {session.phoneNumber && (
        <div className="flex items-center gap-2 mb-3 text-sm text-white/60">
          <Smartphone className="w-4 h-4 text-white/30" />
          <span>{session.phoneNumber}</span>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-white/40">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{session.messageCount.toLocaleString()} mensagens</span>
        </div>
        {session.lastActivity && (
          <span className="text-white/30">
            {timeAgo(session.lastActivity)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
