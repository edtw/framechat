"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Bot,
  BarChart3,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';

const BASE_PATH = '/workspace/whatsapp';

const navigation = [
  { name: 'Visão Geral', href: BASE_PATH, icon: LayoutDashboard },
  { name: 'Sessões', href: `${BASE_PATH}/sessions`, icon: MessageCircle },
  { name: 'Conversas', href: `${BASE_PATH}/conversations`, icon: MessageSquare },
  { name: 'Agentes IA', href: `${BASE_PATH}/agents`, icon: Bot },
  { name: 'Base de Conhecimento', href: `${BASE_PATH}/knowledge`, icon: Bot },
  { name: 'Provedores IA', href: `${BASE_PATH}/chatbot`, icon: Bot },
  { name: 'Análises', href: `${BASE_PATH}/analytics`, icon: BarChart3 },
  { name: 'Configurações', href: `${BASE_PATH}/settings`, icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        cardRef.current
        && !cardRef.current.contains(event.target as Node)
        && menuRef.current
        && !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleProfileClick = () => {
    setMenuOpen(false);
    router.push("/workspace/client/profile");
  };

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    router.push("/login");
  };

  return (
    <aside className="hidden lg:flex h-full w-72 flex-col border-r border-white/10 bg-gradient-to-b from-[#090C1C] via-[#070914] to-[#040610] text-white overflow-hidden">
      <div className="flex flex-col flex-1 p-6 space-y-8 overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide">WhatsApp Hub</p>
            <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">Prisma</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all duration-200',
                  isActive
                    ? 'bg-white/10 text-white shadow-[0_12px_40px_rgba(0,0,0,0.35)]'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="relative">
          <motion.button
            ref={cardRef}
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="group w-full rounded-2xl border border-white/10 bg-gradient-to-br from-white/20 via-white/5 to-transparent p-4 text-left transition hover:border-white/40"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold">
                {user?.username?.slice(0, 2).toUpperCase() || "US"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.username || "Usuário"}</p>
                <p className="text-xs text-white/60">
                  {user?.role === "ADMIN" ? "Administrador" : "Operador"}
                </p>
              </div>
              <div className="rounded-full border border-white/10 p-2 text-white/70 transition group-hover:border-white/40 group-hover:text-white">
                <LogOut className="w-4 h-4 rotate-45" />
              </div>
            </div>
          </motion.button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 bottom-full mb-3 w-48 rounded-2xl border border-white/10 bg-[#080b19]/95 backdrop-blur-sm shadow-2xl shadow-black/40 z-50"
              >
                <button
                  onClick={handleProfileClick}
                  className="w-full px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/10 transition rounded-t-2xl"
                >
                  Ver perfil
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2.5 text-left text-sm text-rose-200 hover:bg-white/5 transition rounded-b-2xl"
                >
                  Encerrar sessão
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
}
