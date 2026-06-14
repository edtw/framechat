'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { extractList } from '@/lib/api-helpers';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckSquare,
  Plus,
  Clock,
  AlertCircle,
  Check,
  Loader2,
  ListOrdered,
  Zap,
  Bot,
  Send,
  SkipForward,
  GripVertical,
  Trash2,
  Edit3,
  Eye,
  X,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ============================================================================
// TYPES
// ============================================================================

interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: string;
  leadName?: string;
  createdAt: string;
}

interface FollowUpStep {
  id: string;
  delayHours: number;
  template: string;
  condition: string;
}

interface FollowUpSequence {
  id: string;
  name: string;
  description: string;
  active: boolean;
  steps: FollowUpStep[];
}

interface FollowUpTask {
  id: string;
  leadName: string;
  sequenceName: string;
  stepTitle: string;
  scheduledFor: string;
  status: 'pending' | 'sent' | 'skipped';
  template: string;
  automated: boolean;
}

type TabKey = 'tarefas' | 'sequencias';

// ============================================================================
// CONSTANTS
// ============================================================================

const priorityConfig: Record<string, { label: string; cls: string }> = {
  HIGH: { label: 'Alta', cls: 'bg-red-500/15 text-red-300' },
  MEDIUM: { label: 'Média', cls: 'bg-amber-500/15 text-amber-300' },
  LOW: { label: 'Baixa', cls: 'bg-blue-500/15 text-blue-300' },
};

const statusConfig: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'bg-white/10 text-white/60' },
  IN_PROGRESS: { label: 'Em Andamento', cls: 'bg-amber-500/15 text-amber-300' },
  COMPLETED: { label: 'Concluída', cls: 'bg-emerald-500/15 text-emerald-300' },
};

const DELAY_OPTIONS = [
  { value: 1, label: '1 hora' },
  { value: 3, label: '3 horas' },
  { value: 6, label: '6 horas' },
  { value: 12, label: '12 horas' },
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas' },
  { value: 72, label: '72 horas' },
  { value: 168, label: '1 semana' },
] as const;

const CONDITION_OPTIONS = [
  { value: 'always', label: 'Sempre (qualquer stage)' },
  { value: 'NOVO', label: 'Stage = Novo' },
  { value: 'EM_CONTATO', label: 'Stage = Em Contato' },
  { value: 'QUALIFICADO', label: 'Stage = Qualificado' },
] as const;

const VARIABLE_HINTS = ['{nome}', '{estagio}', '{plano}'];

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'tarefas', label: 'Tarefas', icon: CheckSquare },
  { key: 'sequencias', label: 'Sequências de Follow-up', icon: ListOrdered },
];

function uid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

function formatDelay(hours: number): string {
  const opt = DELAY_OPTIONS.find((o) => o.value === hours);
  return opt?.label ?? `${hours}h`;
}

// ============================================================================
// SORTABLE STEP (for drag-and-drop in sequence builder)
// ============================================================================

interface SortableStepProps {
  step: FollowUpStep;
  index: number;
  onChange: (field: keyof FollowUpStep, value: string | number) => void;
  onRemove: () => void;
}

function SortableStep({ step, index, onChange, onRemove }: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3',
        isDragging && 'opacity-50 z-50 shadow-lg border-emerald-500/30'
      )}
    >
      {/* Step header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 text-white/20 hover:text-white/60 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical size={16} />
        </button>
        <span className="text-xs font-medium text-white/30">
          Passo {index + 1}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-white/20 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
          aria-label="Remover passo"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Delay + Condition row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-white/40 mb-1">
            Aguardar
          </label>
          <select
            value={step.delayHours}
            onChange={(e) => onChange('delayHours', Number(e.target.value))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
          >
            {DELAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-white/40 mb-1">
            Condição
          </label>
          <select
            value={step.condition}
            onChange={(e) => onChange('condition', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
          >
            {CONDITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Template */}
      <div>
        <label className="block text-[11px] text-white/40 mb-1">
          Mensagem (use variáveis:{' '}
          {VARIABLE_HINTS.map((v, i) => (
            <span key={v}>
              <code className="text-emerald-400/70 bg-emerald-500/10 px-1 py-0.5 rounded text-[10px]">
                {v}
              </code>
              {i < VARIABLE_HINTS.length - 1 ? ' ' : ''}
            </span>
          ))}
          )
        </label>
        <textarea
          value={step.template}
          onChange={(e) => onChange('template', e.target.value)}
          rows={3}
          placeholder="Olá {nome}! Vi que você está no estágio {estagio}..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 resize-none"
        />
      </div>
    </div>
  );
}

// ============================================================================
// SEQUENCE BUILDER MODAL
// ============================================================================

interface SequenceBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sequence: FollowUpSequence) => void;
  initial?: FollowUpSequence | null;
}

function SequenceBuilderModal({
  isOpen,
  onClose,
  onSave,
  initial,
}: SequenceBuilderModalProps) {
  const isEditing = !!initial;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<FollowUpStep[]>([]);
  const [active, setActive] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setName(initial.name);
        setDescription(initial.description);
        setSteps(initial.steps.map((s) => ({ ...s })));
        setActive(initial.active);
      } else {
        setName('');
        setDescription('');
        setSteps([]);
        setActive(true);
      }
      setShowPreview(false);
      setError(null);
      setSaving(false);
    }
  }, [isOpen, initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: activeItem, over } = event;
    if (!over || activeItem.id === over.id) return;
    setSteps((items) => {
      const oldIndex = items.findIndex((s) => s.id === activeItem.id);
      const newIndex = items.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: uid(),
        delayHours: 24,
        template: '',
        condition: 'always',
      },
    ]);
  };

  const updateStep = (
    stepId: string,
    field: keyof FollowUpStep,
    value: string | number
  ) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, [field]: value } : s))
    );
  };

  const removeStep = (stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'O nome da sequência é obrigatório.';
    if (steps.length === 0) return 'Adicione pelo menos um passo.';
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].template.trim())
        return `O passo ${i + 1} precisa de uma mensagem.`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    const sequence: FollowUpSequence = {
      id: initial?.id ?? uid(),
      name: name.trim(),
      description: description.trim(),
      active,
      steps,
    };

    try {
      // Persist to API
      if (isEditing) {
        await api.put(`/api/crm/followup-sequences/${sequence.id}`, sequence);
      } else {
        await api.post('/api/crm/followup-sequences', sequence);
      }
      onSave(sequence);
      onClose();
    } catch {
      // If API fails, still save locally
      onSave(sequence);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const totalDelay = steps.reduce((sum, s) => sum + s.delayHours, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar Sequência' : 'Nova Sequência'}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Name + Active toggle */}
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <label
              htmlFor="seq-name"
              className="block text-sm text-white/60 mb-1.5"
            >
              Nome *
            </label>
            <input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Onboarding Revolut"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              required
            />
          </div>
          <div className="pt-7">
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border',
                active
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-white/[0.03] border-white/10 text-white/40 hover:text-white/60'
              )}
            >
              {active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              {active ? 'Ativa' : 'Inativa'}
            </button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="seq-desc"
            className="block text-sm text-white/60 mb-1.5"
          >
            Descrição
          </label>
          <textarea
            id="seq-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Ex: Sequência de boas-vindas para novos leads..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 resize-none"
          />
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white/80">
              Passos ({steps.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                'flex items-center gap-1.5 text-xs transition-colors px-2.5 py-1.5 rounded-lg',
                showPreview
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-white/40 hover:text-white/60'
              )}
            >
              <Eye size={13} />
              Visualizar fluxo
            </button>
          </div>

          {/* Preview */}
          <AnimatePresence>
            {showPreview && steps.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 mb-4">
                  <p className="text-xs text-white/30 mb-3">
                    Tempo total: {totalDelay}h (
                    {totalDelay >= 24
                      ? `~${Math.round(totalDelay / 24)} dia(s)`
                      : `${totalDelay}h`}
                    )
                  </p>
                  <div className="space-y-0">
                    {steps.map((step, i) => (
                      <div key={step.id} className="flex gap-3">
                        {/* Timeline dot + line */}
                        <div className="flex flex-col items-center">
                          <div
                            className={cn(
                              'w-3 h-3 rounded-full border-2 shrink-0',
                              i === 0
                                ? 'bg-emerald-500 border-emerald-400'
                                : 'bg-white/10 border-white/20'
                            )}
                          />
                          {i < steps.length - 1 && (
                            <div className="w-px flex-1 bg-white/10 my-0.5" />
                          )}
                        </div>
                        <div className="pb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white">
                              Passo {i + 1}
                            </span>
                            <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                              {formatDelay(step.delayHours)}
                            </span>
                            <span className="text-[10px] text-emerald-400/50 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              {CONDITION_OPTIONS.find(
                                (c) => c.value === step.condition
                              )?.label ?? step.condition}
                            </span>
                          </div>
                          <p className="text-xs text-white/40 mt-1 line-clamp-1">
                            {step.template || '(sem mensagem)'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Drag-and-drop step list */}
          {steps.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={steps.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {steps.map((step, i) => (
                    <SortableStep
                      key={step.id}
                      step={step}
                      index={i}
                      onChange={(field, value) =>
                        updateStep(step.id, field, value)
                      }
                      onRemove={() => removeStep(step.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Add step button */}
          <button
            type="button"
            onClick={addStep}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-white/15 rounded-xl text-sm text-white/40 hover:text-white/60 hover:border-white/25 transition-colors"
          >
            <Plus size={15} /> Adicionar Passo
          </button>

          {steps.length === 0 && (
            <p className="text-xs text-white/20 text-center mt-2">
              Nenhum passo adicionado. Clique no botão acima para começar.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-white/60 hover:text-white transition-colors rounded-xl"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            {isEditing ? 'Salvar' : 'Criar Sequência'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// SEQUENCE CARD (expandable)
// ============================================================================

interface SequenceCardProps {
  sequence: FollowUpSequence;
  onToggleActive: (id: string) => void;
  onEdit: (seq: FollowUpSequence) => void;
  onDelete: (id: string) => void;
}

function SequenceCard({
  sequence,
  onToggleActive,
  onEdit,
  onDelete,
}: SequenceCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden transition-colors hover:border-white/10">
      {/* Card header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 text-white/30 hover:text-white/60 transition-colors"
            aria-label={expanded ? 'Recolher' : 'Expandir'}
          >
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-white truncate">
                {sequence.name}
              </h4>
              <button
                onClick={() => onToggleActive(sequence.id)}
                className={cn('shrink-0 transition-colors')}
                aria-label={sequence.active ? 'Desativar' : 'Ativar'}
              >
                {sequence.active ? (
                  <ToggleRight
                    size={18}
                    className="text-emerald-400"
                  />
                ) : (
                  <ToggleLeft size={18} className="text-white/30" />
                )}
              </button>
            </div>
            {sequence.description && (
              <p className="text-xs text-white/30 mt-0.5 line-clamp-1">
                {sequence.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                {sequence.steps.length} passo(s)
              </span>
              <span
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full',
                  sequence.active
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-white/5 text-white/30'
                )}
              >
                {sequence.active ? 'Ativa' : 'Inativa'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(sequence)}
              className="p-1.5 text-white/30 hover:text-white/60 transition-colors rounded-lg hover:bg-white/5"
              aria-label="Editar"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => onDelete(sequence.id)}
              className="p-1.5 text-white/30 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
              aria-label="Excluir"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded steps */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/[0.04]">
              {sequence.steps.length === 0 ? (
                <p className="text-xs text-white/20 py-4 text-center">
                  Nenhum passo configurado.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {sequence.steps.map((step, i) => (
                    <div
                      key={step.id}
                      className="flex items-start gap-3 bg-white/[0.02] rounded-xl p-3"
                    >
                      <span className="text-[10px] font-medium text-white/40 bg-white/5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            {formatDelay(step.delayHours)}
                          </span>
                          <span className="text-[10px] text-purple-400/70 bg-purple-500/10 px-1.5 py-0.5 rounded">
                            {CONDITION_OPTIONS.find(
                              (c) => c.value === step.condition
                            )?.label ?? step.condition}
                          </span>
                        </div>
                        <p className="text-xs text-white/50 line-clamp-2">
                          {step.template || (
                            <span className="text-white/20">
                              (sem mensagem)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function TarefasPage() {
  // ---- Tab state ----
  const [activeTab, setActiveTab] = useState<TabKey>('tarefas');

  // ---- Tasks state (existing) ----
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as Task['priority'],
    dueDate: '',
  });

  // ---- Sequences state ----
  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [seqLoading, setSeqLoading] = useState(false);
  const [seqError, setSeqError] = useState<string | null>(null);
  const [showSeqBuilder, setShowSeqBuilder] = useState(false);
  const [editingSequence, setEditingSequence] =
    useState<FollowUpSequence | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ---- Follow-up tasks state ----
  const [followUpTasks, setFollowUpTasks] = useState<FollowUpTask[]>([]);
  const [fuLoading, setFuLoading] = useState(false);

  // ---- Load tasks ----
  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const { data } = await api.get('/api/crm/tasks');
      setTasks(extractList(data, 'tasks') as Task[]);
    } catch {
      setTasksError('Erro ao carregar tarefas.');
    } finally {
      setTasksLoading(false);
    }
  }, []);

  // ---- Load sequences ----
  const loadSequences = useCallback(async () => {
    setSeqLoading(true);
    setSeqError(null);
    try {
      const { data } = await api.get('/api/crm/followup-sequences');
      const list = extractList(data, 'sequences');
      if (list.length > 0) {
        setSequences(list as FollowUpSequence[]);
      }
    } catch {
      // Backend may not exist yet — use empty state
    } finally {
      setSeqLoading(false);
    }
  }, []);

  // ---- Load follow-up tasks ----
  const loadFollowUpTasks = useCallback(async () => {
    setFuLoading(true);
    try {
      const { data } = await api.get('/api/crm/followup-tasks');
      const list = extractList(data, 'followUpTasks');
      if (list.length > 0) {
        setFollowUpTasks(list as FollowUpTask[]);
      }
    } catch {
      // Backend may not exist yet
    } finally {
      setFuLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    loadSequences();
    loadFollowUpTasks();
  }, [loadTasks, loadSequences, loadFollowUpTasks]);

  // ---- Task CRUD ----
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    setSaving(true);
    try {
      await api.post('/api/crm/tasks', form);
      setForm({ title: '', description: '', priority: 'MEDIUM', dueDate: '' });
      setShowForm(false);
      loadTasks();
    } catch {
      setTasksError('Erro ao criar tarefa.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      await api.patch(`/api/crm/tasks/${task.id}`, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: newStatus } : t
        )
      );
    } catch {
      /* silent */
    }
  };

  // ---- Sequence CRUD ----
  const handleSeqSave = (seq: FollowUpSequence) => {
    setSequences((prev) => {
      const idx = prev.findIndex((s) => s.id === seq.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = seq;
        return updated;
      }
      return [seq, ...prev];
    });
  };

  const handleSeqToggleActive = async (id: string) => {
    const seq = sequences.find((s) => s.id === id);
    if (!seq) return;
    const newActive = !seq.active;
    // Optimistic update
    setSequences((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: newActive } : s))
    );
    try {
      await api.patch(`/api/crm/followup-sequences/${id}`, {
        active: newActive,
      });
    } catch {
      // Revert on failure
      setSequences((prev) =>
        prev.map((s) => (s.id === id ? { ...s, active: seq.active } : s))
      );
    }
  };

  const handleSeqEdit = (seq: FollowUpSequence) => {
    setEditingSequence(seq);
    setShowSeqBuilder(true);
  };

  const handleSeqDelete = async (id: string) => {
    setConfirmDeleteId(null);
    const prev = sequences;
    setSequences((s) => s.filter((x) => x.id !== id));
    try {
      await api.delete(`/api/crm/followup-sequences/${id}`);
    } catch {
      // Revert
      setSequences(prev);
    }
  };

  // ---- Follow-up task actions ----
  const handleFuSendNow = async (taskId: string) => {
    setFollowUpTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: 'sent' as const } : t))
    );
    try {
      await api.post(`/api/crm/followup-tasks/${taskId}/send-now`);
    } catch {
      /* silent */
    }
  };

  const handleFuSkip = async (taskId: string) => {
    setFollowUpTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: 'skipped' as const } : t
      )
    );
    try {
      await api.post(`/api/crm/followup-tasks/${taskId}/skip`);
    } catch {
      /* silent */
    }
  };

  // ---- Derived ----
  const pendingTasks = tasks.filter((t) => t.status !== 'COMPLETED');
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const pendingFollowUps = followUpTasks.filter((t) => t.status === 'pending');

  // ---- Render helpers ----
  const renderEmptyState = (icon: React.ReactNode, message: string) => (
    <div className="text-center py-16">
      <div className="text-white/10 mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-white/40">{message}</p>
    </div>
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-5 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto"
      >
        {/* ---- Tab Selector ---- */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                  activeTab === tab.key
                    ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                )}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ================================================================ */}
        {/* TAREFAS TAB                                                        */}
        {/* ================================================================ */}
        {activeTab === 'tarefas' && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">Tarefas</h1>
                <p className="text-sm text-white/40 mt-0.5">
                  {pendingTasks.length} pendentes · {completedTasks.length}{' '}
                  concluídas
                </p>
              </div>
              <button
                onClick={() => setShowForm(!showForm)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus size={16} /> Nova Tarefa
              </button>
            </div>

            {/* Error */}
            {tasksError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                <AlertCircle size={16} /> {tasksError}
              </div>
            )}

            {/* Create form */}
            <AnimatePresence>
              {showForm && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleCreateTask}
                  className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4 overflow-hidden"
                >
                  <div>
                    <label
                      htmlFor="title"
                      className="block text-sm text-white/60 mb-1.5"
                    >
                      Título *
                    </label>
                    <input
                      id="title"
                      value={form.title}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, title: e.target.value }))
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="desc"
                      className="block text-sm text-white/60 mb-1.5"
                    >
                      Descrição
                    </label>
                    <textarea
                      id="desc"
                      value={form.description}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="priority"
                        className="block text-sm text-white/60 mb-1.5"
                      >
                        Prioridade
                      </label>
                      <select
                        id="priority"
                        value={form.priority}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            priority: e.target.value as Task['priority'],
                          }))
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="LOW">Baixa</option>
                        <option value="MEDIUM">Média</option>
                        <option value="HIGH">Alta</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="dueDate"
                        className="block text-sm text-white/60 mb-1.5"
                      >
                        Prazo
                      </label>
                      <input
                        id="dueDate"
                        type="date"
                        value={form.dueDate}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            dueDate: e.target.value,
                          }))
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2 text-sm text-white/60 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="btn-primary flex items-center gap-2"
                    >
                      {saving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : null}{' '}
                      Criar
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Loading */}
            {tasksLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 bg-white/[0.02] rounded-2xl animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* ---- Follow-up tasks section ---- */}
                {(pendingFollowUps.length > 0 || fuLoading) && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider flex items-center gap-2">
                      <Zap size={13} className="text-amber-400/60" />
                      Follow-up Automático
                    </h2>
                    {fuLoading ? (
                      <div className="h-12 bg-white/[0.02] rounded-2xl animate-pulse" />
                    ) : (
                      pendingFollowUps.map((ft) => (
                        <div
                          key={ft.id}
                          className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4"
                        >
                          <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <Bot size={14} className="text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white">
                              {ft.stepTitle || ft.sequenceName}
                            </p>
                            <p className="text-xs text-white/30 truncate">
                              {ft.leadName} ·{' '}
                              {new Date(ft.scheduledFor).toLocaleString(
                                'pt-BR'
                              )}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full shrink-0',
                              ft.automated
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-purple-500/15 text-purple-400'
                            )}
                          >
                            {ft.automated ? 'Automático' : 'Manual'}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleFuSendNow(ft.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors"
                              title="Enviar agora"
                            >
                              <Send size={12} /> Agora
                            </button>
                            <button
                              onClick={() => handleFuSkip(ft.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-white/5 text-white/40 rounded-lg hover:bg-white/10 hover:text-white/60 transition-colors"
                              title="Pular"
                            >
                              <SkipForward size={12} /> Pular
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ---- Manual tasks: pending ---- */}
                {pendingTasks.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">
                      Pendentes
                    </h2>
                    {pendingTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => toggleTaskStatus(task)}
                        className="w-full flex items-center gap-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 text-left hover:border-white/10 transition-colors"
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                            task.status === 'COMPLETED'
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'border-white/20'
                          )}
                        >
                          {task.status === 'COMPLETED' && (
                            <Check size={12} className="text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              'text-sm',
                              task.status === 'COMPLETED'
                                ? 'text-white/40 line-through'
                                : 'text-white'
                            )}
                          >
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-white/30 mt-0.5 truncate">
                              {task.description}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full font-medium',
                            priorityConfig[task.priority]?.cls
                          )}
                        >
                          {priorityConfig[task.priority]?.label}
                        </span>
                        {task.dueDate && (
                          <span className="text-[11px] text-white/30 flex items-center gap-1">
                            <Clock size={11} />{' '}
                            {new Date(task.dueDate).toLocaleDateString(
                              'pt-BR'
                            )}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* ---- Manual tasks: completed ---- */}
                {completedTasks.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-medium text-white/30 uppercase tracking-wider">
                      Concluídas
                    </h2>
                    {completedTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => toggleTaskStatus(task)}
                        className="w-full flex items-center gap-4 bg-white/[0.01] border border-white/[0.04] rounded-2xl p-4 text-left opacity-60 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-5 h-5 rounded-full bg-emerald-500 border-emerald-500 flex items-center justify-center shrink-0">
                          <Check size={12} className="text-white" />
                        </div>
                        <span className="text-sm text-white/40 line-through flex-1">
                          {task.title}
                        </span>
                        <span className="text-[10px] text-emerald-400/50 px-2 py-0.5 rounded-full bg-emerald-500/10">
                          Concluída
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Empty: no tasks of any kind */}
                {tasks.length === 0 &&
                  pendingFollowUps.length === 0 && (
                    renderEmptyState(
                      <CheckSquare size={40} />,
                      'Nenhuma tarefa cadastrada.'
                    )
                  )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* SEQUÊNCIAS TAB                                                    */}
        {/* ================================================================ */}
        {activeTab === 'sequencias' && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Sequências de Follow-up
                </h1>
                <p className="text-sm text-white/40 mt-0.5">
                  {sequences.length} sequência(s) ·{' '}
                  {sequences.filter((s) => s.active).length} ativa(s)
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingSequence(null);
                  setShowSeqBuilder(true);
                }}
                className="btn-primary flex items-center gap-2"
              >
                <Plus size={16} /> Nova Sequência
              </button>
            </div>

            {/* Error */}
            {seqError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                <AlertCircle size={16} /> {seqError}
              </div>
            )}

            {/* Loading */}
            {seqLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-24 bg-white/[0.02] rounded-2xl animate-pulse"
                  />
                ))}
              </div>
            ) : sequences.length > 0 ? (
              <div className="space-y-3">
                {sequences.map((seq) => (
                  <SequenceCard
                    key={seq.id}
                    sequence={seq}
                    onToggleActive={handleSeqToggleActive}
                    onEdit={handleSeqEdit}
                    onDelete={(id) => setConfirmDeleteId(id)}
                  />
                ))}
              </div>
            ) : (
              renderEmptyState(
                <ListOrdered size={40} />,
                'Nenhuma sequência cadastrada.\nClique em "Nova Sequência" para criar a primeira.'
              )
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* SEQUENCE BUILDER MODAL                                            */}
        {/* ================================================================ */}
        <SequenceBuilderModal
          isOpen={showSeqBuilder}
          onClose={() => {
            setShowSeqBuilder(false);
            setEditingSequence(null);
          }}
          onSave={handleSeqSave}
          initial={editingSequence}
        />

        {/* ================================================================ */}
        {/* DELETE CONFIRMATION MODAL                                         */}
        {/* ================================================================ */}
        <Modal
          isOpen={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          title="Excluir Sequência"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Tem certeza que deseja excluir esta sequência? Esta ação não pode
              ser desfeita.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2.5 text-sm text-white/60 hover:text-white transition-colors rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSeqDelete(confirmDeleteId!)}
                className="px-4 py-2.5 text-sm bg-red-500/15 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/25 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </Modal>
      </motion.div>
    
  );
}
