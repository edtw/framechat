'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { extractList } from '@/lib/api-helpers';
import { motion } from 'framer-motion';
import {
  Settings,
  Brain,
  BookOpen,
  User,
  Key,
  Thermometer,
  Hash,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';

interface KnowledgeItem {
  id: number;
  title: string;
  content: string;
  category?: string;
  updatedAt?: string;
}

interface AIConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export default function SettingsPage() {
  const { user } = useAuthStore();

  // AI Config
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    apiKey: '',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048,
  });
  const [showKey, setShowKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);

  // Knowledge Base
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbError, setKbError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [kbSaving, setKbSaving] = useState(false);

  // Profile
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Global error
  const [error, setError] = useState<string | null>(null);

  // Load AI config
  const loadAIConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/api/settings/ai');
      const cfg = data.config || data;
      setAiConfig({
        apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 8)}${'*'.repeat(Math.max(0, (cfg.apiKey.length - 12)))}${cfg.apiKey.slice(-4)}` : '',
        model: cfg.model || 'deepseek-chat',
        temperature: cfg.temperature ?? 0.7,
        maxTokens: cfg.maxTokens || 2048,
      });
    } catch { /* config may not exist yet */ }
  }, []);

  // Load KB
  const loadKB = useCallback(async () => {
    setKbLoading(true);
    setKbError(null);
    try {
      const { data } = await api.get('/api/settings/knowledge-base');
      setItems(extractList(data, 'items') as KnowledgeItem[]);
    } catch {
      setKbError('Erro ao carregar base de conhecimento.');
    } finally {
      setKbLoading(false);
    }
  }, []);

  // Load Profile
  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/api/settings/profile');
      const p = data.profile || data;
      setProfileName(p.name || user?.name || '');
      setProfileEmail(p.email || user?.email || '');
      setProfilePhone(p.phone || '');
    } catch { /* fallback to store */ }
  }, [user]);

  useEffect(() => {
    loadAIConfig();
    loadKB();
    loadProfile();
  }, [loadAIConfig, loadKB, loadProfile]);

  // Save AI config
  const handleSaveAI = async () => {
    setAiSaving(true);
    setError(null);
    try {
      await api.put('/api/settings/ai', {
        model: aiConfig.model,
        temperature: aiConfig.temperature,
        maxTokens: aiConfig.maxTokens,
      });
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar configuracao AI.');
    } finally {
      setAiSaving(false);
    }
  };

  // Save Profile
  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setError(null);
    try {
      await api.put('/api/settings/profile', {
        name: profileName,
        email: profileEmail,
        phone: profilePhone,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar perfil.');
    } finally {
      setProfileSaving(false);
    }
  };

  // KB CRUD
  const handleAddItem = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setKbSaving(true);
    setKbError(null);
    try {
      const { data } = await api.post('/api/settings/knowledge-base', {
        title: newTitle.trim(),
        content: newContent.trim(),
      });
      const created = data.item || data;
      setItems((prev) => [...prev, created]);
      setNewTitle('');
      setNewContent('');
    } catch {
      setKbError('Erro ao adicionar item.');
    } finally {
      setKbSaving(false);
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('Remover este item da base de conhecimento?')) return;
    try {
      await api.delete(`/api/settings/knowledge-base/${id}`);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch {
      setKbError('Erro ao remover item.');
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem || !editingItem.title.trim()) return;
    setKbSaving(true);
    setKbError(null);
    try {
      const { data } = await api.put(`/api/settings/knowledge-base/${editingItem.id}`, {
        title: editingItem.title,
        content: editingItem.content,
      });
      setItems((prev) => prev.map((it) => (it.id === editingItem.id ? (data.item || data) : it)));
      setEditingItem(null);
    } catch {
      setKbError('Erro ao atualizar item.');
    } finally {
      setKbSaving(false);
    }
  };

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6 max-w-3xl">
        <h1 className="text-2xl font-bold text-white">Ajustes</h1>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* ── AI Configuration ── */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Brain size={20} className="text-emerald-400" />
            <h2 className="text-sm font-medium text-white">Configuracao de IA (DeepSeek)</h2>
          </div>

          <div className="space-y-4">
            {/* API Key */}
            <div>
              <label className="block text-sm text-white/60 mb-1.5">API Key</label>
              <div className="relative">
                <div className="relative">
                  <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={aiConfig.apiKey}
                    readOnly
                    className="input-field pl-9 pr-10 font-mono text-xs"
                    placeholder="sk-••••••••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-white/30 mt-1">
                  A chave e armazenada de forma segura. Altere via variavel de ambiente DEEPSEEK_API_KEY.
                </p>
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Modelo</label>
              <select
                value={aiConfig.model}
                onChange={(e) => setAiConfig((c) => ({ ...c, model: e.target.value }))}
                className="input-field"
              >
                <option value="deepseek-chat">DeepSeek Chat</option>
                <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                <option value="deepseek-coder">DeepSeek Coder</option>
              </select>
            </div>

            {/* Temperature */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-white/60">Temperatura</label>
                <span className="text-xs text-emerald-400 font-mono">{aiConfig.temperature}</span>
              </div>
              <div className="flex items-center gap-3">
                <Thermometer size={14} className="text-white/30 shrink-0" />
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={aiConfig.temperature}
                  onChange={(e) => setAiConfig((c) => ({ ...c, temperature: parseFloat(e.target.value) }))}
                  className="w-full h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-500/30"
                />
              </div>
              <div className="flex justify-between text-[10px] text-white/30 mt-1">
                <span>0 — Preciso</span>
                <span>2 — Criativo</span>
              </div>
            </div>

            {/* Max Tokens */}
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Max Tokens</label>
              <div className="relative">
                <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="number"
                  value={aiConfig.maxTokens}
                  onChange={(e) => setAiConfig((c) => ({ ...c, maxTokens: parseInt(e.target.value) || 1024 }))}
                  min={256}
                  max={8192}
                  step={256}
                  className="input-field pl-9"
                />
              </div>
            </div>

            <button
              onClick={handleSaveAI}
              disabled={aiSaving}
              className="btn-primary flex items-center gap-2"
            >
              {aiSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : aiSaved ? (
                <Check size={16} />
              ) : (
                <Save size={16} />
              )}
              {aiSaved ? 'Salvo!' : 'Salvar Configuracao AI'}
            </button>
          </div>
        </div>

        {/* ── Knowledge Base ── */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <BookOpen size={20} className="text-emerald-400" />
            <h2 className="text-sm font-medium text-white">Base de Conhecimento</h2>
          </div>

          {kbError && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-sm text-red-400 mb-4">
              <AlertCircle size={14} /> {kbError}
            </div>
          )}

          {/* List */}
          {kbLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-6">Nenhum item na base de conhecimento.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{item.title}</p>
                    <p className="text-xs text-white/40 truncate mt-0.5">{item.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingItem(item)}
                      className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new item */}
          <div className="space-y-2 p-3 rounded-xl bg-white/[0.02] border border-white/10">
            <input
              placeholder="Titulo do item"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="input-field"
            />
            <textarea
              placeholder="Conteudo do item"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              className="input-field resize-y"
            />
            <button
              onClick={handleAddItem}
              disabled={kbSaving || !newTitle.trim() || !newContent.trim()}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Adicionar Item
            </button>
          </div>

          {/* Edit modal (inline) */}
          {editingItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white">Editar Item</h3>
                  <button onClick={() => setEditingItem(null)} className="text-white/40 hover:text-white"><X size={18} /></button>
                </div>
                <input
                  value={editingItem.title}
                  onChange={(e) => setEditingItem((prev) => prev ? { ...prev, title: e.target.value } : null)}
                  className="input-field mb-3"
                />
                <textarea
                  value={editingItem.content}
                  onChange={(e) => setEditingItem((prev) => prev ? { ...prev, content: e.target.value } : null)}
                  rows={4}
                  className="input-field mb-3 resize-y"
                />
                <div className="flex gap-2">
                  <button onClick={() => setEditingItem(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={handleUpdateItem} disabled={kbSaving} className="btn-primary flex-1">
                    {kbSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Operator Profile ── */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <User size={20} className="text-emerald-400" />
            <h2 className="text-sm font-medium text-white">Perfil do Operador</h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Nome</label>
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="input-field"
                  placeholder="Nome do operador"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Email</label>
                <input
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  className="input-field"
                  placeholder="email@exemplo.com"
                  disabled
                />
                <p className="text-[10px] text-white/30 mt-1">Email vinculado a conta. Contate o admin para alterar.</p>
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Telefone</label>
              <input
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                className="input-field max-w-xs"
                placeholder="(11) 99999-9999"
              />
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="btn-primary flex items-center gap-2"
            >
              {profileSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : profileSaved ? (
                <Check size={16} />
              ) : (
                <Save size={16} />
              )}
              {profileSaved ? 'Salvo!' : 'Salvar Perfil'}
            </button>
          </div>
        </div>
      </motion.div>
    
  );
}
