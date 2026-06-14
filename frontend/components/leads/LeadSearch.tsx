'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn, formatPhone } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, User, Mail, Phone } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import type { Lead } from '@/types/lead';

interface LeadSearchProps {
  onSelect: (lead: Lead) => void;
}

interface SearchResult extends Lead {}

export function LeadSearch({ onSelect }: LeadSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Search function
  const searchLeads = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/crm/leads?search=${encodeURIComponent(searchQuery)}`
      );
      if (!response.ok) {
        throw new Error('Falha ao buscar leads');
      }
      const data = await response.json();
      setResults(data.leads || data || []);
      if ((data.leads || data || []).length === 0) {
        setError('Nenhum lead encontrado');
      }
    } catch (err) {
      setError('Erro ao buscar leads');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchLeads(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchLeads]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          handleSelect(results[highlightIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelect = (lead: Lead) => {
    onSelect(lead);
    setQuery(lead.name);
    setIsOpen(false);
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        icon={Search}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setHighlightIndex(-1);
        }}
        onFocus={() => query.trim() && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar leads por nome, email, telefone..."
        className="w-full"
      />

      <AnimatePresence>
        {isOpen && (query.trim() || loading || error) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 z-50 mt-1 bg-black/95 border border-white/10 rounded-xl backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {/* Loading state */}
            {loading && (
              <div className="px-4 py-3 text-sm text-white/40 flex items-center gap-2">
                <motion.div
                  className="w-3 h-3 rounded-full border border-emerald-400/30 border-t-emerald-400"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }}
                />
                Buscando...
              </div>
            )}

            {/* Error / empty state */}
            {!loading && error && (
              <div className="px-4 py-3 text-sm text-white/40">{error}</div>
            )}

            {/* Results */}
            {!loading &&
              results.map((lead, index) => (
                <button
                  key={lead.id}
                  onClick={() => handleSelect(lead)}
                  className={cn(
                    'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors',
                    index === highlightIndex
                      ? 'bg-emerald-500/10'
                      : 'hover:bg-white/5',
                    index < results.length - 1 && 'border-b border-white/5'
                  )}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-white">
                      {lead.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-white/30 flex-shrink-0" />
                      <span className="text-sm text-white font-medium truncate">
                        {lead.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {lead.email}
                      </span>
                      {lead.phone && (
                        <span className="text-xs text-white/30 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {formatPhone(lead.phone)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}

            {/* No query state */}
            {!loading && !error && !query.trim() && (
              <div className="px-4 py-3 text-sm text-white/30">
                Digite para buscar leads
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
