'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLeadApi } from '@/hooks/useLeadApi';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { extractList } from '@/lib/api-helpers';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  QrCode,
  Copy,
  Check,
  DollarSign,
  Key,
  Building,
  MapPin,
  User,
  AlertCircle,
  Clipboard,
} from 'lucide-react';

interface LeadOption {
  id: number;
  name: string;
}

export default function PIXGeneratePage() {
  const router = useRouter();
  const { fetchLeads } = useLeadApi();

  const [amount, setAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [merchantCity, setMerchantCity] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [brCode, setBrCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Leads for selector
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);

  const loadLeads = useCallback(async () => {
    try {
      const data = await fetchLeads({ limit: 200 });
      setLeads(extractList(data, 'leads').map((l: any) => ({ id: l.id, name: l.name })));
    } catch { /* ignore */ } finally {
      setLoadingLeads(false);
    }
  }, [fetchLeads]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const formatAmount = (value: string) => {
    const digits = value.replace(/\D/g, '');
    const num = (parseInt(digits, 10) || 0) / 100;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(raw);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(amount) / 100;
    if (!amountNum || amountNum <= 0) {
      setError('Informe um valor valido.');
      return;
    }
    if (!pixKey.trim()) {
      setError('Informe a chave PIX.');
      return;
    }

    setGenerating(true);
    try {
      const { data } = await api.post('/api/pix/generate', {
        amount: amountNum,
        pixKey: pixKey.trim(),
        merchantName: merchantName.trim() || undefined,
        merchantCity: merchantCity.trim() || undefined,
        leadId: selectedLeadId ? Number(selectedLeadId) : undefined,
        description: description.trim() || undefined,
      });
      setQrCode(data.qrcode || data.qrCode || data.qr_code || null);
      setBrCode(data.brCode || data.code || data.pixCode || null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao gerar PIX.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (brCode && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNew = () => {
    setQrCode(null);
    setBrCode(null);
    setAmount('');
  };

  return (
    
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5 max-w-2xl">
        {/* Back */}
        <button onClick={() => router.push('/pix')} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Voltar para PIX
        </button>

        <h1 className="text-2xl font-bold text-white">Gerar PIX</h1>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* QR Result */}
        {qrCode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/[0.03] border border-emerald-500/20 rounded-2xl backdrop-blur-xl p-6 flex flex-col items-center"
          >
            <div className="bg-white p-4 rounded-2xl mb-4">
              <img src={qrCode} alt="PIX QR Code" className="w-56 h-56" />
            </div>
            <p className="text-sm text-white/60 mb-2">Escaneie o QR code com o app do seu banco</p>

            {brCode && (
              <div className="w-full mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-white/40">Codigo PIX (BR Code)</span>
                </div>
                <div className="bg-white/[0.05] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3">
                  <code className="text-xs text-white/60 break-all flex-1">{brCode}</code>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      'shrink-0 p-2 rounded-lg transition-all',
                      copied
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-white/10 text-white/60 hover:text-white hover:bg-white/20'
                    )}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                {copied && (
                  <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                    <Check size={12} /> Codigo copiado para a area de transferencia!
                  </p>
                )}
              </div>
            )}

            <button onClick={handleNew} className="btn-secondary mt-5 px-6">
              Gerar Novo PIX
            </button>
          </motion.div>
        )}

        {/* Generation Form */}
        {!qrCode && (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl p-6">
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Valor (BRL) *</label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      placeholder="0,00"
                      value={amount ? formatAmount(amount) : ''}
                      onChange={handleAmountChange}
                      className="input-field pl-9"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Chave PIX *</label>
                  <div className="relative">
                    <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      placeholder="CPF/CNPJ, email, telefone ou aleatoria"
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      className="input-field pl-9"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Nome do Recebedor</label>
                  <div className="relative">
                    <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      placeholder="Nome ou Razao Social"
                      value={merchantName}
                      onChange={(e) => setMerchantName(e.target.value)}
                      className="input-field pl-9"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Cidade do Recebedor</label>
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      placeholder="Cidade"
                      value={merchantCity}
                      onChange={(e) => setMerchantCity(e.target.value)}
                      className="input-field pl-9"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Lead (opcional)</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <select
                      value={selectedLeadId}
                      onChange={(e) => setSelectedLeadId(e.target.value)}
                      className="input-field pl-9 appearance-none"
                    >
                      <option value="">Nenhum lead especifico</option>
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Descricao</label>
                  <input
                    placeholder="Ex: Pagamento de servico"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={generating}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
              >
                {generating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <QrCode size={18} />
                    Gerar PIX
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </motion.div>
    
  );
}
