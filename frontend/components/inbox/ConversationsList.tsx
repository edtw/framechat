'use client';

import { Search, Filter, Plus, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

interface Conversation {
  id: string;
  userNumber: string;
  userName?: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount?: number;
  isTakenOver?: boolean;
  takenOverBy?: string;
  isActive?: boolean;
  leadScore?: number;
  lifecycleStage?: string;
  contactMissing?: boolean;
}

interface ConversationsListProps {
  conversations: Conversation[];
  selectedConversation: string | null;
  onSelectConversation: (id: string) => void;
  onSearch: (term: string) => void;
  onFilter: () => void;
}

export default function ConversationsList({
  conversations,
  selectedConversation,
  onSelectConversation,
  onSearch,
  onFilter
}: ConversationsListProps) {
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#0a0f21] to-[#060710] backdrop-blur-xl">
      {/* Header */}
      <div className="p-5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-light text-white tracking-wide">Conversas</h2>
          <button
            className="p-2 hover:bg-white/10 rounded-xl transition-all duration-200 group"
            title="Nova conversa"
          >
            <Plus className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Buscar conversas..."
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={onFilter}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 rounded-lg transition-all duration-200"
          >
            <Filter className="w-3.5 h-3.5" />
            Filtrar
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {conversations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center p-8"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 backdrop-blur-xl">
              <MessageCircle className="w-8 h-8 text-white/30" />
            </div>
            <p className="text-sm text-white/70 mb-1 font-light">Nenhuma conversa</p>
            <p className="text-xs text-white/50">
              Inicie uma nova conversa ou aguarde mensagens
            </p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {conversations.map((conversation, index) => (
              <motion.button
                key={conversation.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                onClick={() => onSelectConversation(conversation.id)}
                className={`w-full p-4 border-b border-white/5 hover:bg-white/5 transition-all duration-200 text-left group relative overflow-hidden ${
                  selectedConversation === conversation.id
                    ? 'bg-gradient-to-r from-indigo-500/10 to-transparent border-l-2 border-l-indigo-500'
                    : 'border-l-2 border-l-transparent'
                }`}
              >
                {/* Hover gradient effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="flex items-start gap-3 relative z-10">
                  {/* Avatar with gradient */}
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 border border-white/10 backdrop-blur-xl">
                      <span className="text-sm font-medium text-white/90">
                        {conversation.userName?.charAt(0)?.toUpperCase() || conversation.userNumber.slice(-2)}
                      </span>
                    </div>
                    {conversation.unreadCount && conversation.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center border-2 border-[#0a0f21]">
                        <span className="text-[10px] font-semibold text-white">
                          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-white truncate">
                        {conversation.userName || conversation.userNumber}
                      </h3>
                      <span className="text-[11px] text-white/40 ml-2 flex-shrink-0">
                        {formatDistanceToNow(new Date(conversation.lastTimestamp), {
                          addSuffix: true,
                          locale: ptBR
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-white/60 truncate mb-2 font-light">
                      {conversation.lastMessage}
                    </p>

                    {/* Status badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {conversation.isTakenOver && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                          {conversation.takenOverBy === 'Você' ? '👤 Você' : '👥 Atribuída'}
                        </span>
                      )}
                      {!conversation.isTakenOver && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/5 text-white/60 border border-white/10">
                          🤖 Agente
                        </span>
                      )}
                      {conversation.contactMissing && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/20 text-amber-100 border border-amber-500/30">
                          Registrar contato
                        </span>
                      )}
                      {conversation.lifecycleStage && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/20 text-purple-200 border border-purple-500/30">
                          {conversation.lifecycleStage}
                        </span>
                      )}
                      {conversation.leadScore !== undefined && conversation.leadScore > 0 && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                          conversation.leadScore >= 80
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
                            : conversation.leadScore >= 50
                            ? 'bg-amber-500/20 text-amber-200 border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-200 border-rose-500/30'
                        }`}>
                          ⭐ {conversation.leadScore}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
