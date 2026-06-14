'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Briefcase,
  CheckSquare,
  Phone,
  BookOpen,
  DollarSign,
  CreditCard,
  ShieldCheck,
  Bot,
  Hash,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

// ==================== Navigation Structure ====================

interface SubItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

interface SidebarSection {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string; // If set, clicking navigates directly (no sub-panel)
  children?: SubItem[];
}

const sections: SidebarSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
  },
  {
    id: 'inbox',
    label: 'Caixa de Entrada',
    icon: MessageSquare,
    href: '/inbox',
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: Users,
    children: [
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/negocios', label: 'Negócios', icon: Briefcase },
      { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
      { href: '/contatos', label: 'Contatos', icon: Phone },
      { href: '/conhecimento', label: 'Conhecimento', icon: BookOpen },
    ],
  },
  {
    id: 'analytics',
    label: 'Relatórios',
    icon: BarChart3,
    href: '/relatorios',
  },
  {
    id: 'finance',
    label: 'Financeiro',
    icon: DollarSign,
    children: [
      { href: '/pix', label: 'Cobranças PIX', icon: DollarSign },
      { href: '/virtual-cards', label: 'Cartões Virtuais', icon: CreditCard },
    ],
  },
  {
    id: 'settings',
    label: 'Configurações',
    icon: Settings,
    children: [
      { href: '/settings', label: 'Configurações', icon: Settings },
      { href: '/lgpd', label: 'Privacidade & LGPD', icon: ShieldCheck },
      { href: '/discord', label: 'Discord', icon: Bot },
      { href: '/whatsapp', label: 'WhatsApp', icon: Hash },
    ],
  },
];

// ==================== Helpers ====================

function isPathActive(pathname: string | null, section: SidebarSection): boolean {
  if (!pathname) return false;
  if (section.href) {
    if (section.id === 'dashboard') return pathname === '/dashboard';
    if (section.id === 'analytics') return pathname?.startsWith('/relatorios');
    return pathname === section.href || pathname?.startsWith(section.href + '/');
  }
  return section.children?.some(
    (c) => pathname === c.href || pathname?.startsWith(c.href + '/')
  ) ?? false;
}

// ==================== Component ====================

export function IconSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-expand the section that contains the current page
  useEffect(() => {
    for (const section of sections) {
      if (isPathActive(pathname, section) && section.children) {
        setExpandedSection(section.id);
        return;
      }
    }
  }, [pathname]);

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSectionClick = (section: SidebarSection) => {
    if (section.href) {
      router.push(section.href);
      setExpandedSection(null);
    } else if (section.children) {
      setExpandedSection(expandedSection === section.id ? null : section.id);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
    setMobileMenuOpen(false);
  };

  const handleMobileNav = (href: string) => {
    router.push(href);
    setMobileMenuOpen(false);
  };

  const activeSectionId = sections.find((s) => isPathActive(pathname, s))?.id;

  // ==================== DESKTOP ====================

  const desktopSidebar = (
    <div className="hidden md:flex h-full">
      {/* Icon rail (56px) */}
      <aside className="flex flex-col w-14 shrink-0 bg-[#0C0C14] border-r border-white/[0.05] items-center py-3 gap-1 relative z-50">
        {/* Brand */}
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-2 hover:scale-105 transition-transform"
          title="AFILIATORS"
        >
          <span className="text-[10px] font-black text-white tracking-tight">AF</span>
        </Link>

        <div className="w-6 h-px bg-white/[0.06] my-1" />

        {/* Nav tabs */}
        <nav className="flex flex-col items-center gap-0.5 flex-1">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = isPathActive(pathname, section);
            const isExpanded = expandedSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => handleSectionClick(section)}
                className={cn(
                  'relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 group',
                  active || isExpanded
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                )}
                title={section.label}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 rounded-r-full" />
                )}
                <Icon size={20} />
                {/* Tooltip */}
                <span
                  className={cn(
                    'absolute left-full ml-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50',
                    active
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-[#1C1C27] text-white/80'
                  )}
                  style={{ backdropFilter: 'blur(12px)' }}
                >
                  {section.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="w-6 h-px bg-white/[0.06] my-1" />

        {/* User */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.03] border border-white/[0.06] flex items-center justify-center text-xs font-semibold text-white/60 hover:border-white/20 hover:text-white/80 transition-all"
          >
            {getInitials(user?.name)}
          </button>
          <AnimatePresence>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute bottom-full left-full ml-2 mb-0 w-48 bg-[#16161F] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="px-3 py-2.5 border-b border-white/[0.06]">
                    <p className="text-sm text-white font-medium truncate">{user?.name || 'Operador'}</p>
                    <p className="text-[11px] text-white/30 truncate">
                      {user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={15} />
                    Sair
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Secondary panel (fly-out sub-navigation) */}
      <AnimatePresence>
        {expandedSection && (() => {
          const section = sections.find((s) => s.id === expandedSection);
          if (!section?.children) return null;
          return (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="bg-[#0C0C14] border-r border-white/[0.05] overflow-hidden shrink-0"
            >
              <div className="w-[220px] flex flex-col h-full">
                {/* Section header */}
                <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                      {section.label}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedSection(null)}
                    className="p-1 rounded text-white/20 hover:text-white/50"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Sub-items */}
                <nav className="flex-1 py-2 overflow-y-auto">
                  {section.children.map((child) => {
                    const Icon = child.icon;
                    const childActive = pathname === child.href || pathname?.startsWith(child.href + '/');
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setExpandedSection(null)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-all group border-l-[3px]',
                          childActive
                            ? 'border-emerald-400 bg-emerald-500/10 text-emerald-400'
                            : 'border-transparent text-white/50 hover:text-white hover:bg-white/[0.04] hover:border-white/10'
                        )}
                      >
                        <Icon size={16} className={cn(childActive ? 'text-emerald-400' : 'text-white/30')} />
                        <span className="flex-1">{child.label}</span>
                        {child.badge && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-medium">
                            {child.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>

                {/* Section footer with user info */}
                <div className="px-4 py-3 border-t border-white/[0.05]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold shrink-0">
                      {getInitials(user?.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white/70 truncate">{user?.name}</p>
                      <p className="text-[10px] text-white/25">
                        {user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.aside>
          );
        })()}
      </AnimatePresence>
    </div>
  );

  // ==================== MOBILE ====================

  const mobileBar = (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-[#0C0C14]/95 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-white/60 p-1"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-white truncate">
            {sections.find((s) => isPathActive(pathname, s))?.label || 'AFILIATORS'}
          </h1>
        </div>
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold">
          {getInitials(user?.name)}
        </div>
      </div>

      {/* Mobile slide-out menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-30 bg-black/60"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="md:hidden fixed left-0 top-0 bottom-0 w-[280px] z-40 bg-[#0C0C14] border-r border-white/[0.05] flex flex-col pt-14"
            >
              {/* Brand */}
              <div className="px-5 py-3 border-b border-white/[0.05]">
                <h2 className="text-base font-bold text-white">AFILIATORS</h2>
                <p className="text-[10px] text-white/30 uppercase tracking-widest">CRM</p>
              </div>

              {/* Nav */}
              <nav className="flex-1 overflow-y-auto py-2">
                {sections.map((section) => {
                  const Icon = section.icon;
                  const active = isPathActive(pathname, section);
                  return (
                    <div key={section.id}>
                      {/* Section header */}
                      <button
                        onClick={() => {
                          if (section.href) {
                            handleMobileNav(section.href);
                          } else if (section.children) {
                            setExpandedSection(expandedSection === section.id ? null : section.id);
                          }
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                          active ? 'text-emerald-400 bg-emerald-500/[0.06]' : 'text-white/40 hover:text-white/60'
                        )}
                      >
                        <Icon size={18} />
                        <span className="flex-1 text-left">{section.label}</span>
                        {section.children && (
                          <ChevronRight
                            size={14}
                            className={cn(
                              'transition-transform',
                              expandedSection === section.id && 'rotate-90'
                            )}
                          />
                        )}
                      </button>

                      {/* Sub-items */}
                      <AnimatePresence>
                        {section.children && expandedSection === section.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="ml-10 border-l border-white/[0.05] py-1 space-y-0.5">
                              {section.children.map((child) => {
                                const ChildIcon = child.icon;
                                const childActive = pathname === child.href || pathname?.startsWith(child.href + '/');
                                return (
                                  <button
                                    key={child.href}
                                    onClick={() => handleMobileNav(child.href)}
                                    className={cn(
                                      'w-full flex items-center gap-2.5 px-4 py-2 text-sm rounded-r-lg transition-colors border-l-[3px]',
                                      childActive
                                        ? 'border-emerald-400 bg-emerald-500/10 text-emerald-400'
                                        : 'border-transparent text-white/40 hover:text-white/60'
                                    )}
                                  >
                                    <ChildIcon size={14} />
                                    {child.label}
                                    {child.badge && (
                                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">
                                        {child.badge}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </nav>

              {/* User + Logout */}
              <div className="p-4 border-t border-white/[0.05]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                    {getInitials(user?.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{user?.name}</p>
                    <p className="text-[11px] text-white/30">
                      {user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <LogOut size={15} />
                  Sair
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Mobile bottom bar (compact, shown when menu is closed) */}
      {!mobileMenuOpen && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#0C0C14]/95 backdrop-blur-xl border-t border-white/[0.06] flex items-center justify-around px-1 pb-safe">
          {sections.slice(0, 5).map((section) => {
            const Icon = section.icon;
            const active = isPathActive(pathname, section);
            return (
              <button
                key={section.id}
                onClick={() => {
                  if (section.href) {
                    handleMobileNav(section.href);
                  } else {
                    setMobileMenuOpen(true);
                    setExpandedSection(section.id);
                  }
                }}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 px-3 min-w-0 rounded-lg transition-colors',
                  active ? 'text-emerald-400' : 'text-white/30'
                )}
              >
                <Icon size={20} />
                <span className="text-[10px] font-medium truncate max-w-[48px]">{section.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );

  return (
    <>
      {desktopSidebar}
      {mobileBar}
    </>
  );
}
