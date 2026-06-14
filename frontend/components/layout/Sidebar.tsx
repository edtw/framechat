'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Users,
  MessageCircle,
  DollarSign,
  CreditCard,
  Shield,
  Settings,
  LogOut,
  BarChart3,
  Briefcase,
  CheckSquare,
  BookOpen,
  Phone,
  Bot,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const mainNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/negocios', label: 'Negócios', icon: Briefcase },
  { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/discord', label: 'Discord', icon: Bot },
  { href: '/contatos', label: 'Contatos', icon: Phone },
  { href: '/pix', label: 'PIX', icon: DollarSign },
  { href: '/virtual-cards', label: 'Cartões', icon: CreditCard },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/conhecimento', label: 'Conhecimento', icon: BookOpen },
  { href: '/lgpd', label: 'LGPD', icon: Shield },
];

const bottomNavItems: NavItem[] = [
  { href: '/settings', label: 'Config', icon: Settings },
];

interface SidebarProps {
  onLogout?: () => void;
  userName?: string;
  userEmail?: string;
}

export function Sidebar({ onLogout, userName, userEmail }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen bg-white/[0.02] border-r border-white/10 backdrop-blur-xl">
      {/* Logo area */}
      <div className="flex items-center gap-2 px-6 h-16 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-white" />
        </div>
        <span className="font-bold text-white text-lg">AFILIATORS</span>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {mainNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group',
                active
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              )}
            >
              {/* Active indicator bar */}
              {active && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-emerald-400 rounded-r-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        {bottomNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative',
                active
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* User info & logout */}
        <div className="mt-2 pt-3 border-t border-white/10">
          {userName && (
            <div className="px-3 mb-2">
              <p className="text-sm font-medium text-white truncate">
                {userName}
              </p>
              {userEmail && (
                <p className="text-xs text-white/40 truncate">{userEmail}</p>
              )}
            </div>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-red-400 hover:bg-red-500/5 transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
