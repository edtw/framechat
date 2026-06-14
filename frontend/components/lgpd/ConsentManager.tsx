'use client';

import React, { useState } from 'react';
import { cn, formatDateTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  MessageCircle,
  Megaphone,
  CreditCard,
  Database,
  DollarSign,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type ConsentType =
  | 'DATA_PROCESSING'
  | 'WHATSAPP_CONTACT'
  | 'MARKETING'
  | 'PIX_TRANSACTION'
  | 'CARD_ISSUANCE';

interface Consent {
  id: string;
  type: ConsentType;
  granted: boolean;
  grantedAt?: string;
  revokedAt?: string;
}

interface ConsentManagerProps {
  leadId: string;
  consents: Consent[];
}

const CONSENT_CONFIG: Record<
  ConsentType,
  { label: string; description: string; icon: React.ElementType }
> = {
  DATA_PROCESSING: {
    label: 'Processamento de Dados',
    description:
      'Consentimento para coleta, armazenamento e processamento de dados pessoais conforme LGPD.',
    icon: Database,
  },
  WHATSAPP_CONTACT: {
    label: 'Contato via WhatsApp',
    description:
      'Autorizacao para envio de mensagens e comunicacoes via WhatsApp.',
    icon: MessageCircle,
  },
  MARKETING: {
    label: 'Marketing',
    description:
      'Consentimento para receber comunicacoes de marketing, promocoes e novidades.',
    icon: Megaphone,
  },
  PIX_TRANSACTION: {
    label: 'Transacoes PIX',
    description:
      'Autorizacao para gerar cobrancas PIX vinculadas a este lead.',
    icon: DollarSign,
  },
  CARD_ISSUANCE: {
    label: 'Emissao de Cartao',
    description:
      'Consentimento para emissao de cartao virtual em nome do titular.',
    icon: CreditCard,
  },
};

const CONSENT_ORDER: ConsentType[] = [
  'DATA_PROCESSING',
  'WHATSAPP_CONTACT',
  'MARKETING',
  'PIX_TRANSACTION',
  'CARD_ISSUANCE',
];

export function ConsentManager({ leadId, consents: initialConsents }: ConsentManagerProps) {
  const [consents, setConsents] = useState<Consent[]>(initialConsents);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const getConsent = (type: ConsentType) =>
    consents.find((c) => c.type === type);

  const handleToggle = async (type: ConsentType) => {
    const existing = getConsent(type);
    if (!existing) return;

    const newGranted = !existing.granted;
    const key = existing.id;

    setToggling((prev) => ({ ...prev, [key]: true }));
    setError(null);

    try {
      const endpoint = newGranted
        ? `/api/lgpd/consent/grant`
        : `/api/lgpd/consent/revoke`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          consentType: type,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Falha ao atualizar consentimento');
      }

      const updated = await response.json();
      setConsents((prev) =>
        prev.map((c) =>
          c.type === type
            ? {
                ...c,
                granted: updated.granted ?? newGranted,
                grantedAt: updated.grantedAt || c.grantedAt,
                revokedAt: updated.revokedAt || c.revokedAt,
              }
            : c
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao atualizar consentimento'
      );
    } finally {
      setToggling((prev) => ({ ...prev, [key]: false }));
    }
  };

  const allGranted = CONSENT_ORDER.every(
    (type) => getConsent(type)?.granted
  );
  const someGranted = CONSENT_ORDER.some(
    (type) => getConsent(type)?.granted
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/10 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Consentimentos LGPD
            </h3>
            <p className="text-xs text-white/40">
              {allGranted
                ? 'Todos os consentimentos concedidos'
                : someGranted
                  ? 'Alguns consentimentos pendentes'
                  : 'Nenhum consentimento concedido'}
            </p>
          </div>
        </div>
        <Badge variant={allGranted ? 'success' : 'warning'}>
          {CONSENT_ORDER.filter((t) => getConsent(t)?.granted).length}/
          {CONSENT_ORDER.length}
        </Badge>
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </motion.div>
      )}

      {/* Consent list */}
      <div className="space-y-2">
        {CONSENT_ORDER.map((type) => {
          const consent = getConsent(type);
          const config = CONSENT_CONFIG[type];
          const isGranted = consent?.granted ?? false;
          const isToggling = consent ? toggling[consent.id] : false;

          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'flex items-start gap-4 p-4 rounded-xl border transition-colors',
                isGranted
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-white/[0.02] border-white/5'
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  isGranted
                    ? 'bg-emerald-500/20'
                    : 'bg-white/5'
                )}
              >
                <config.icon
                  className={cn(
                    'w-5 h-5',
                    isGranted ? 'text-emerald-400' : 'text-white/20'
                  )}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-medium text-white">
                    {config.label}
                  </h4>
                  <Badge
                    variant={isGranted ? 'success' : 'error'}
                    className="flex-shrink-0"
                  >
                    {isGranted ? 'Concedido' : 'Revogado'}
                  </Badge>
                </div>
                <p className="text-xs text-white/40 leading-relaxed mb-2">
                  {config.description}
                </p>
                {isGranted && consent?.grantedAt && (
                  <p className="text-[10px] text-white/20">
                    Concedido em: {formatDateTime(consent.grantedAt)}
                  </p>
                )}
                {!isGranted && consent?.revokedAt && (
                  <p className="text-[10px] text-white/20">
                    Revogado em: {formatDateTime(consent.revokedAt)}
                  </p>
                )}
              </div>

              {/* Toggle button */}
              <button
                onClick={() => handleToggle(type)}
                disabled={isToggling || !consent}
                className={cn(
                  'flex-shrink-0 p-1 rounded-lg transition-all',
                  'hover:bg-white/5',
                  isToggling && 'opacity-50 cursor-wait'
                )}
                aria-label={
                  isGranted
                    ? `Revogar ${config.label}`
                    : `Conceder ${config.label}`
                }
              >
                {isToggling ? (
                  <motion.div
                    className="w-8 h-5 rounded-full bg-white/10"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  />
                ) : isGranted ? (
                  <ToggleRight className="w-8 h-5 text-emerald-400" />
                ) : (
                  <ToggleLeft className="w-8 h-5 text-white/20" />
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            CONSENT_ORDER.forEach((type) => {
              const c = getConsent(type);
              if (c && !c.granted) handleToggle(type);
            });
          }}
          disabled={allGranted}
        >
          Conceder Todos
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            CONSENT_ORDER.forEach((type) => {
              const c = getConsent(type);
              if (c && c.granted) handleToggle(type);
            });
          }}
          disabled={!someGranted}
        >
          Revogar Todos
        </Button>
      </div>
    </div>
  );
}
