'use client';

import { useState, FormEvent, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import api from '@/lib/api';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, isAuthenticated, hydrated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // Redirect if already authenticated — wait for hydration first
  useEffect(() => {
    if (hydrated && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [hydrated, isAuthenticated, router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Show loading spinner while Zustand rehydrates from localStorage
  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Already authenticated — don't flash the login form
  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Preencha todos os campos.');
      return;
    }

    if (!navigator.onLine) {
      setError('Sem conexao com a internet.');
      return;
    }

    setLoading(true);
    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const response = await api.post('/api/auth/login', { email, password }, {
        signal: abortRef.current.signal,
      });

      if (!mountedRef.current) return;

      const { token, user } = response.data?.data || response.data || {};
      if (token && user) {
        setAuth(user, token);
        router.push('/dashboard');
      } else {
        setError('Resposta invalida do servidor.');
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      if (err?.code === 'ERR_CANCELED') return;
      const message =
        err.response?.data?.error || err.response?.data?.message || 'Credenciais invalidas. Tente novamente.';
      setError(message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-teal-500/5 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 160 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/25"
            >
              <span className="text-white font-bold text-2xl tracking-tight">A</span>
            </motion.div>
            <h1 className="text-2xl font-bold text-white tracking-tight">AFILIATORS</h1>
            <p className="text-sm text-white/40 mt-1">Painel do Operador</p>
          </div>

          {/* Error message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              role="alert"
              aria-live="polite"
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-sm text-red-400"
            >
              <AlertCircle size={16} aria-hidden="true" />
              {error}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operador@exemplo.com"
              autoComplete="email"
              disabled={loading}
              required
              aria-required="true"
            />

            <div className="relative">
              <Input
                id="password"
                label="Senha"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                required
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[2.15rem] text-white/40 hover:text-white/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <Button
              type="submit"
              loading={loading}
              icon={LogIn}
              className="w-full mt-2"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <p className="text-center text-xs text-white/30 mt-6">
            AFILIATORS v1.0 — Gestao de Leads
          </p>
        </div>
      </motion.div>
    </div>
  );
}
