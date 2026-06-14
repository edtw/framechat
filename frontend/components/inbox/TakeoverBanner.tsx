'use client';

import { User, Bot, ArrowLeftRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface TakeoverBannerProps {
  isTakenOver: boolean;
  takenOverBy?: string;
  onTakeOver: () => void;
  onReturnToAI: () => void;
  loading?: boolean;
}

export default function TakeoverBanner({
  isTakenOver,
  takenOverBy,
  onTakeOver,
  onReturnToAI,
  loading = false
}: TakeoverBannerProps) {
  if (isTakenOver) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 bg-gradient-to-r from-indigo-500/15 via-indigo-500/10 to-transparent border-b border-indigo-500/20 backdrop-blur-xl px-5 py-3"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
                <User className="w-4 h-4 text-indigo-200" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {takenOverBy === 'Você'
                  ? 'Você está gerenciando esta conversa'
                  : `${takenOverBy} está gerenciando esta conversa`}
              </p>
              <p className="text-xs text-indigo-200/70 mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                Respostas automáticas pausadas
              </p>
            </div>
          </div>

          {takenOverBy === 'Você' && (
            <motion.button
              onClick={onReturnToAI}
              disabled={loading}
              whileHover={{ scale: !loading ? 1.02 : 1 }}
              whileTap={{ scale: !loading ? 0.98 : 1 }}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-100 bg-white/10 border border-indigo-400/30 rounded-xl hover:bg-white/20 hover:border-indigo-400/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-xl"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-indigo-200/30 border-t-indigo-200 rounded-full animate-spin" />
                  <span className="hidden sm:inline">Devolvendo...</span>
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4" />
                  <span className="hidden sm:inline">Devolver ao Agente</span>
                  <span className="sm:hidden">Devolver</span>
                </>
              )}
            </motion.button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-10 bg-gradient-to-r from-white/5 to-transparent border-b border-white/5 backdrop-blur-xl px-5 py-3"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10">
              <Bot className="w-4 h-4 text-white/70" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/90 truncate">
              Agente está gerenciando esta conversa
            </p>
            <p className="text-xs text-white/60 mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Respostas automáticas ativas
            </p>
          </div>
        </div>

        <motion.button
          onClick={onTakeOver}
          disabled={loading}
          whileHover={{ scale: !loading ? 1.02 : 1 }}
          whileTap={{ scale: !loading ? 0.98 : 1 }}
          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="hidden sm:inline">Assumindo...</span>
            </>
          ) : (
            <>
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Assumir Conversa</span>
              <span className="sm:hidden">Assumir</span>
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
