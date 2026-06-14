'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  DollarSign,
  CreditCard,
  ShieldCheck,
  Settings,
  Menu,
  X,
  LogOut,
  Phone,
  CheckSquare,
  BarChart3,
  Briefcase,
  BookOpen,
  Bot,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

// ==================== NAVIGATION STRUCTURE ====================

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const navigation: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/negocios', label: 'Negócios', icon: Briefcase },
      { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
      { href: '/whatsapp', label: 'Conversas', icon: MessageSquare },
      { href: '/discord', label: 'Discord', icon: Bot },
      { href: '/contatos', label: 'Contatos', icon: Phone },
      { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
      { href: '/conhecimento', label: 'Conhecimento', icon: BookOpen },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { href: '/pix', label: 'Cobranças PIX', icon: DollarSign },
      { href: '/virtual-cards', label: 'Cartões Virtuais', icon: CreditCard },
    ],
  },
  {
    title: 'Configurações',
    items: [
      { href: '/lgpd', label: 'Privacidade & LGPD', icon: ShieldCheck },
      { href: '/settings', label: 'Configurações', icon: Settings },
    ],
  },
];

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/leads': 'Leads',
  '/negocios': 'Negócios',
  '/contatos': 'Contatos',
  '/whatsapp': 'Conversas',
  '/discord': 'Discord',
  '/tarefas': 'Tarefas',
  '/relatorios': 'Relatórios',
  '/conhecimento': 'Conhecimento',
  '/pix': 'Cobranças PIX',
  '/virtual-cards': 'Cartões Virtuais',
  '/lgpd': 'Privacidade & LGPD',
  '/settings': 'Configurações',
  '/login': 'Login',
};

// ==================== COMPONENT ====================

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAuthenticated, hydrated } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle =
    Object.entries(pageTitles).find(([key]) => pathname?.startsWith(key))?.[1] || '';

  // Auth guard — wait for zustand hydration before deciding
  useEffect(() => {
    if (hydrated && !isAuthenticated && typeof window !== 'undefined') {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, router]);

  // Show nothing while zustand is hydrating from localStorage
  if (!hydrated) return null;

  if (!isAuthenticated) return null;

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  const renderNavItems = (items: NavItem[]) =>
    items.map((item) => {
      const Icon = item.icon;
      const active = isActive(item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group border-l-[3px]',
            active
              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-400'
              : 'border-transparent text-white/50 hover:text-white hover:bg-white/[0.04] hover:border-white/10'
          )}
        >
          <Icon
            size={18}
            className={cn(
              active
                ? 'text-emerald-400'
                : 'text-white/30 group-hover:text-white/60'
            )}
          />
          <span className="flex-1">{item.label}</span>
          {item.badge && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">
              {item.badge}
            </span>
          )}
        </Link>
      );
    });

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/[0.06] bg-[#0A0A0F] shrink-0">
        {/* Brand */}
        <div className="p-5 border-b border-white/[0.06]">
          <Link href="/dashboard" className="inline-block">
            <h1 className="text-lg font-bold text-white tracking-tight">AFILIATORS</h1>
          </Link>
          <p className="text-[11px] text-white/30 mt-0.5 uppercase tracking-widest">CRM</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
          {navigation.map((section) => (
            <div key={section.title}>
              <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 mb-1.5">
                {section.title}
              </p>
              <div className="space-y-0.5">{renderNavItems(section.items)}</div>
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
              {user?.name?.[0]?.toUpperCase() || 'O'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{user?.name || 'Operador'}</p>
              <p className="text-[11px] text-white/30 truncate">
                {user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
              </p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-white/20 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-[#0A0A0F]/80 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white/60">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <h1 className="text-sm font-medium text-white">{pageTitle}</h1>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#0A0A0F] border-r border-white/[0.06] p-4 pt-16 overflow-y-auto">
            {/* Brand in mobile sidebar */}
            <div className="mb-4 pb-3 border-b border-white/[0.06]">
              <h2 className="text-sm font-bold text-white tracking-tight">AFILIATORS</h2>
              <p className="text-[10px] text-white/30 uppercase tracking-widest">CRM</p>
            </div>

            <nav className="space-y-4">
              {navigation.map((section) => (
                <div key={section.title}>
                  <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 mb-1.5">
                    {section.title}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all border-l-[3px]',
                            active
                              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-400'
                              : 'border-transparent text-white/50'
                          )}
                        >
                          <Icon
                            size={18}
                            className={cn(active ? 'text-emerald-400' : 'text-white/40')}
                          />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Mobile user profile */}
            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                  {user?.name?.[0]?.toUpperCase() || 'O'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{user?.name || 'Operador'}</p>
                  <p className="text-[11px] text-white/30 truncate">
                    {user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 text-white/20 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                  title="Sair"
                  aria-label="Sair"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}

export default DashboardLayout;
