'use client';

import React, { useState } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Copy, Check, DollarSign, User, Building, MapPin, FileText } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { Lead } from '@/types/lead';

interface PixGeneratorProps {
  preSelectedLead?: Lead | null;
  onGenerated?: (pixData: PixResponse) => void;
}

interface PixResponse {
  qrCodeImage: string;
  brCode: string;
  txid: string;
  amount: number;
}

interface FormData {
  amount: string;
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  leadId: string;
  description: string;
}

export function PixGenerator({
  preSelectedLead,
  onGenerated,
}: PixGeneratorProps) {
  const [form, setForm] = useState<FormData>({
    amount: '',
    pixKey: '',
    merchantName: '',
    merchantCity: '',
    leadId: preSelectedLead?.id || '',
    description: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PixResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Informe um valor valido');
      return;
    }
    if (!form.pixKey.trim()) {
      setError('Informe a chave PIX');
      return;
    }
    if (!form.merchantName.trim()) {
      setError('Informe o nome do recebedor');
      return;
    }
    if (!form.merchantCity.trim()) {
      setError('Informe a cidade');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/pix/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          pixKey: form.pixKey,
          merchantName: form.merchantName,
          merchantCity: form.merchantCity,
          leadId: form.leadId || undefined,
          description: form.description || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Erro ao gerar PIX');
      }

      const data: PixResponse = await response.json();
      setResult(data);
      onGenerated?.(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao gerar cobranca PIX'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.brCode) return;
    try {
      await navigator.clipboard.writeText(result.brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
      const textarea = document.createElement('textarea');
      textarea.value = result.brCode;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setResult(null);
    setForm({
      amount: '',
      pixKey: '',
      merchantName: '',
      merchantCity: '',
      leadId: preSelectedLead?.id || '',
      description: '',
    });
  };

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-6"
          >
            {/* QR Code */}
            <div className="flex flex-col items-center gap-4 p-6 bg-white/[0.03] border border-white/10 rounded-2xl">
              <h3 className="text-sm font-medium text-white/70">
                QR Code PIX
              </h3>
              {result.qrCodeImage ? (
                <img
                  src={result.qrCodeImage}
                  alt="QR Code PIX"
                  className="w-48 h-48 rounded-xl border border-white/10 bg-white p-2"
                />
              ) : (
                <div className="w-48 h-48 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-white/20" />
                </div>
              )}
              <p className="text-lg font-bold text-emerald-400">
                {formatCurrency(result.amount)}
              </p>
              <p className="text-xs text-white/30 font-mono break-all text-center">
                TXID: {result.txid}
              </p>
            </div>

            {/* BR Code */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/70">
                Codigo BR Code (Pix Copia e Cola)
              </label>
              <div className="flex gap-2">
                <div className="flex-1 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs text-white/50 font-mono break-all select-all">
                  {result.brCode}
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  icon={copied ? Check : Copy}
                  onClick={handleCopy}
                  className="flex-shrink-0"
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            </div>

            <Button variant="ghost" onClick={handleReset}>
              Gerar novo PIX
            </Button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleGenerate}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Valor (R$)"
                icon={DollarSign}
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => update('amount', e.target.value)}
                placeholder="0,00"
                required
              />
              <Input
                label="Chave PIX"
                icon={Copy}
                value={form.pixKey}
                onChange={(e) => update('pixKey', e.target.value)}
                placeholder="CPF, email, telefone ou chave aleatoria"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nome do Recebedor"
                icon={User}
                value={form.merchantName}
                onChange={(e) => update('merchantName', e.target.value)}
                placeholder="Nome completo"
                required
              />
              <Input
                label="Cidade"
                icon={MapPin}
                value={form.merchantCity}
                onChange={(e) => update('merchantCity', e.target.value)}
                placeholder="Sao Paulo"
                required
              />
            </div>

            <Input
              label="Descricao (opcional)"
              icon={FileText}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Pagamento referente a..."
            />

            {/* Error */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-red-400"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              <QrCode className="w-4 h-4 mr-2" />
              Gerar PIX
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
