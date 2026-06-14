'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { UnifiedConversation, Platform } from '@/types/unified';
import type { WritingSignature, Persona, SelfSignature } from '@/types/discord';
import {
  Info,
  FileText,
  VenetianMask,
  X,
  Hash,
  Clock,
  MessageSquare,
  BarChart3,
  Activity,
  Brain,
} from 'lucide-react';

// ==================== Props ====================

interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  conversation: UnifiedConversation | null;
  // Writing signatures
  partnerSignature?: WritingSignature | null;
  selfSignature?: SelfSignature | null;
  onAnalyzeSignature?: () => void;
  // Personas
  personas?: Persona[];
  activePersona?: Persona | null;
  onSetActivePersona?: (personaId: string) => void;
  // Platform metadata
  discordAccounts?: Array<{ id: string; name: string; status: string }>;
}

// ==================== Tab Definitions ====================

type DetailTab = 'info' | 'signature' | 'persona';

const TABS: { id: DetailTab; label: string; icon: React.ElementType }[] = [
  { id: 'info', label: 'Info', icon: Info },
  { id: 'signature', label: 'Assinatura', icon: FileText },
  { id: 'persona', label: 'Persona', icon: VenetianMask },
];

// ==================== Sub-Components ====================

function InfoTab({ conversation }: { conversation: UnifiedConversation | null }) {
  if (!conversation) return null;
  const meta = conversation.metadata as unknown as Record<string, unknown>;

  return (
    <div className="space-y-4">
      {/* Contact */}
      <div>
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Contato</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Nome</span>
            <span className="text-xs text-white/70">{conversation.contactName || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">ID</span>
            <span className="text-xs text-white/50 font-mono">{conversation.contactIdentifier.slice(0, 20)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Plataforma</span>
            <span
              className={cn(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                conversation.platform === 'discord'
                  ? 'bg-[#5865F2]/20 text-[#5865F2]'
                  : 'bg-[#25D366]/20 text-[#25D366]'
              )}
            >
              {conversation.platform === 'discord' ? 'Discord' : 'WhatsApp'}
            </span>
          </div>
        </div>
      </div>

      {/* Platform-specific */}
      {conversation.platform === 'discord' && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Discord</p>
          <div className="space-y-2">
            {(meta as any).guildName && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Servidor</span>
                <span className="text-xs text-white/70 flex items-center gap-1">
                  <Hash size={10} /> {String((meta as any).guildName)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Canal</span>
              <span className="text-xs text-white/70">{(meta as any).channelType === 'DM' ? 'DM' : 'Servidor'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Tem assinatura?</span>
              <span className={cn('text-xs', (meta as any).hasSignature ? 'text-emerald-400' : 'text-white/30')}>
                {(meta as any).hasSignature ? 'Sim' : 'Não'}
              </span>
            </div>
          </div>
        </div>
      )}

      {conversation.platform === 'whatsapp' && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">WhatsApp</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Sessão</span>
              <span className="text-xs text-white/50 font-mono">{String((meta as any).sessionId || '').slice(0, 12)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Bot ativo</span>
              <span className={cn('text-xs', (meta as any).isBotActive ? 'text-emerald-400' : 'text-white/30')}>
                {(meta as any).isBotActive ? 'Sim' : 'Não'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div>
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Estatísticas</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40 flex items-center gap-1">
              <MessageSquare size={10} /> Última msg
            </span>
            <span className="text-xs text-white/50">
              {conversation.lastMessageTime
                ? new Date(conversation.lastMessageTime).toLocaleDateString('pt-BR')
                : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40 flex items-center gap-1">
              <BarChart3 size={10} /> Lead Score
            </span>
            <span className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded-full',
              (conversation.leadScore ?? 0) >= 80
                ? 'bg-emerald-500/15 text-emerald-300'
                : (conversation.leadScore ?? 0) >= 50
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-white/[0.04] text-white/30'
            )}>
              {conversation.leadScore != null ? `${conversation.leadScore}pts` : '—'}
            </span>
          </div>
          {conversation.lifecycleStage && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Estágio</span>
              <span className="text-xs text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded-full">
                {conversation.lifecycleStage}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignatureTab({
  partnerSignature,
  selfSignature,
  onAnalyze,
}: {
  partnerSignature?: WritingSignature | null;
  selfSignature?: SelfSignature | null;
  onAnalyze?: () => void;
}) {
  const renderTrait = (label: string, value: unknown) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs text-white/70 font-medium">{String(value ?? '—')}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Partner signature */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
            Escrita do Contato
          </p>
          {onAnalyze && (
            <button
              onClick={onAnalyze}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <Brain size={10} />
              Analisar
            </button>
          )}
        </div>
        {partnerSignature ? (
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3 space-y-0">
            {renderTrait('Tamanho médio', `${partnerSignature.avgMessageLength?.toFixed(0) ?? '—'} chars`)}
            {renderTrait('Emojis/msg', partnerSignature.emojiFrequency?.toFixed(2) ?? '—')}
            {renderTrait('Pontuação', partnerSignature.punctuationStyle ?? '—')}
            {renderTrait('Capitalização', partnerSignature.capitalization ?? '—')}
            {renderTrait('Formalidade', partnerSignature.formalityScore != null ? `${(partnerSignature.formalityScore * 100).toFixed(0)}%` : '—')}
            {renderTrait('Abreviações', partnerSignature.abbreviationRate != null ? `${(partnerSignature.abbreviationRate * 100).toFixed(0)}%` : '—')}
            {partnerSignature.commonWords?.length > 0 && (
              <div className="pt-1">
                <span className="text-[10px] text-white/30">Palavras comuns:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {partnerSignature.commonWords.slice(0, 5).map((w) => (
                    <span key={w} className="text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded text-white/50">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-white/20 italic">Nenhuma assinatura analisada</p>
        )}
      </div>

      {/* Self signature */}
      <div>
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
          Sua Escrita (IA)
        </p>
        {selfSignature ? (
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3 space-y-0">
            {renderTrait('Tamanho médio', `${selfSignature.avgMessageLength?.toFixed(0) ?? '—'} chars`)}
            {renderTrait('Emojis/msg', selfSignature.emojiFrequency?.toFixed(2) ?? '—')}
            {renderTrait('Pontuação', selfSignature.punctuationStyle ?? '—')}
            {renderTrait('Formalidade', selfSignature.formalityScore != null ? `${(selfSignature.formalityScore * 100).toFixed(0)}%` : '—')}
          </div>
        ) : (
          <p className="text-xs text-white/20 italic">Auto-assinatura não disponível</p>
        )}
      </div>
    </div>
  );
}

function PersonaTab({
  personas = [],
  activePersona,
  onSetActive,
}: {
  personas?: Persona[];
  activePersona?: Persona | null;
  onSetActive?: (personaId: string) => void;
}) {
  if (personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/15">
        <VenetianMask size={28} className="mb-2 opacity-30" />
        <p className="text-xs text-white/20">Nenhuma persona criada</p>
        <p className="text-[10px] text-white/10 mt-1 text-center">
          Crie personas no gerenciador Discord
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
        Persona Ativa
      </p>
      {personas.map((p) => {
        const isActive = activePersona?.id === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSetActive?.(p.id)}
            className={cn(
              'w-full text-left p-3 rounded-lg border transition-all',
              isActive
                ? 'bg-emerald-500/[0.06] border-emerald-500/20'
                : 'bg-white/[0.02] border-white/[0.04] hover:border-white/[0.08]'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{p.name}</span>
              {isActive && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">
                  Ativa
                </span>
              )}
            </div>
            {p.description && (
              <p className="text-xs text-white/30 mt-1 line-clamp-2">{p.description}</p>
            )}
            {isActive && p.systemPrompt && (
              <div className="mt-2 p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                <p className="text-[10px] text-white/25 font-mono whitespace-pre-wrap line-clamp-4">
                  {p.systemPrompt}
                </p>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ==================== Main Component ====================

export default function DetailPanel({
  open,
  onClose,
  conversation,
  partnerSignature,
  selfSignature,
  onAnalyzeSignature,
  personas,
  activePersona,
  onSetActivePersona,
}: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('info');

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 300, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="shrink-0 border-l border-white/[0.05] bg-[#0C0C14] overflow-hidden"
        >
          <div className="w-[300px] h-full flex flex-col">
            {/* Tab header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
              <div className="flex items-center gap-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                        isActive
                          ? 'bg-white/[0.06] text-white'
                          : 'text-white/25 hover:text-white/50'
                      )}
                    >
                      <Icon size={13} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-white/20 hover:text-white/50 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {activeTab === 'info' && <InfoTab conversation={conversation} />}
              {activeTab === 'signature' && (
                <SignatureTab
                  partnerSignature={partnerSignature}
                  selfSignature={selfSignature}
                  onAnalyze={onAnalyzeSignature}
                />
              )}
              {activeTab === 'persona' && (
                <PersonaTab
                  personas={personas}
                  activePersona={activePersona}
                  onSetActive={onSetActivePersona}
                />
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export { type DetailPanelProps };
