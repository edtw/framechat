'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { extractList } from '@/lib/api-helpers';
import { formatPhone } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Phone, Plus, Search, Mail, Building, Loader2, AlertCircle } from 'lucide-react';

interface Contact {
  id: number;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  notes?: string;
  createdAt: string;
}

export default function ContatosPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/crm/contacts', { params: { search: search || undefined } });
      setContacts(extractList(data, 'contacts') as Contact[]);
    } catch {
      setError('Erro ao carregar contatos.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    setSaving(true);
    try {
      await api.post('/api/crm/contacts', form);
      setForm({ name: '', phone: '', email: '', company: '', notes: '' });
      setShowForm(false);
      load();
    } catch {
      setError('Erro ao criar contato.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = contacts.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Contatos</h1>
            <p className="text-sm text-white/40 mt-0.5">Gerencie sua base de contatos</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo Contato
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        {showForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} onSubmit={handleCreate}
            className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm text-white/60 mb-1.5">Nome *</label>
                <input id="name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50" required />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm text-white/60 mb-1.5">Telefone *</label>
                <input id="phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50" required />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm text-white/60 mb-1.5">Email</label>
                <input id="email" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm text-white/60 mb-1.5">Empresa</label>
                <input id="company" value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
              </div>
            </div>
            <div>
              <label htmlFor="notes" className="block text-sm text-white/60 mb-1.5">Observacoes</label>
              <textarea id="notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-white/60 hover:text-white">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
              </button>
            </div>
          </motion.form>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-32 bg-white/[0.02] rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Phone size={40} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/40">{search ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => (
              <div key={c.id} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <h3 className="text-white font-medium">{c.name}</h3>
                <div className="space-y-1 mt-2">
                  {c.phone && <p className="text-xs text-white/40 flex items-center gap-1.5"><Phone size={12} /> {formatPhone(c.phone)}</p>}
                  {c.email && <p className="text-xs text-white/40 flex items-center gap-1.5"><Mail size={12} /> {c.email}</p>}
                  {c.company && <p className="text-xs text-white/40 flex items-center gap-1.5"><Building size={12} /> {c.company}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    
  );
}
