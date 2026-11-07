import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, AlertTriangle, Users, QrCode, Sliders, Building2,
  LogOut, Menu, X, ChevronsLeft, ChevronsRight, Shield, Mail,
} from 'lucide-react';

interface VisibleModules {
  module_patrol?: boolean;
  module_incidents?: boolean;
  module_qr_generator?: boolean;
  module_integrations?: boolean;
  daily_reports?: boolean;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  show: boolean;
  match: (path: string) => boolean;
}

const TITLES: [RegExp, string][] = [
  [/^\/overview/, 'Overview'],
  [/^\/platform/, 'Industries & entitlements'],
  [/^\/reports/, 'Patrol reports'],
  [/^\/incidents\/.+/, 'Incident details'],
  [/^\/incidents/, 'Incident queue'],
  [/^\/guards/, 'People & access'],
  [/^\/qr-generator/, 'Routes & QR codes'],
  [/^\/daily-reports/, 'Daily shift reports'],
  [/^\/admin\/configs/, 'Integrations'],
];

const initials = (name?: string) =>
  (name || 'A').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'A';

const tierLabel = (user: any) =>
  user?.tier === 'SUPER_ADMIN' ? 'Platform Super Admin'
  : user?.tier === 'INDUSTRY_ADMIN' ? `Industry Admin${user?.role ? ' · ' + user.role : ''}`
  : user?.role || user?.employee_code || '';

export const AppShell: React.FC<{
  user: any;
  modules: VisibleModules;
  onLogout: () => void;
  children: React.ReactNode;
}> = ({ user, modules, onLogout, children }) => {
  const location = useLocation();
  const path = location.pathname;

  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('sidebar_collapsed') === '1');
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [now, setNow] = useState(new Date());

  // Dynamic Industry Branding (auto-updates when Super Admin edits a tenant or user logs in)
  const [brandInfo, setBrandInfo] = useState<{ name: string; logoUrl: string | null; address?: string | null }>({
    name: user?.tenant_name || 'Rakshak Security',
    logoUrl: user?.tenant_logo_url || null,
    address: user?.tenant_address || null,
  });

  useEffect(() => {
    const syncBrand = () => {
      try {
        const custom = JSON.parse(localStorage.getItem('active_tenant_branding') || 'null');
        if (custom && custom.name) {
          setBrandInfo({ name: custom.name, logoUrl: custom.logo_url || null, address: custom.address || null });
          return;
        }
      } catch (_) {}
      setBrandInfo({
        name: user?.tenant_name || 'Rakshak Security',
        logoUrl: user?.tenant_logo_url || null,
        address: user?.tenant_address || null,
      });
    };
    syncBrand();
    window.addEventListener('rakshak-brand-updated', syncBrand);
    return () => window.removeEventListener('rakshak-brand-updated', syncBrand);
  }, [user]);

  useEffect(() => { localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { setDrawer(false); setMenu(false); }, [path]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const isSuper = user?.tier === 'SUPER_ADMIN';

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Monitor',
      items: [
        { to: '/overview', label: 'Overview', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, show: !isSuper, match: (p) => p.startsWith('/overview') },
        { to: '/reports', label: 'Patrol reports', icon: <FileText className="h-[18px] w-[18px]" />, show: modules.module_patrol === true, match: (p) => p.startsWith('/reports') },
        { to: '/incidents', label: 'Incidents', icon: <AlertTriangle className="h-[18px] w-[18px]" />, show: modules.module_incidents === true, match: (p) => p.startsWith('/incidents') },
      ],
    },
    {
      title: 'Manage',
      items: [
        { to: '/guards', label: 'People & access', icon: <Users className="h-[18px] w-[18px]" />, show: true, match: (p) => p.startsWith('/guards') },
        { to: '/daily-reports', label: 'Daily reports', icon: <Mail className="h-[18px] w-[18px]" />, show: !isSuper && modules.module_patrol === true && modules.daily_reports === true, match: (p) => p.startsWith('/daily-reports') },
        { to: '/qr-generator', label: 'Routes & QR codes', icon: <QrCode className="h-[18px] w-[18px]" />, show: modules.module_qr_generator === true, match: (p) => p.startsWith('/qr-generator') },
        { to: '/admin/configs', label: 'Integrations', icon: <Sliders className="h-[18px] w-[18px]" />, show: modules.module_integrations === true, match: (p) => p.startsWith('/admin/configs') },
      ],
    },
    {
      title: 'Platform',
      items: [
        { to: '/platform', label: 'Industries', icon: <Building2 className="h-[18px] w-[18px]" />, show: isSuper, match: (p) => p.startsWith('/platform') },
      ],
    },
  ];

  const title = TITLES.find(([re]) => re.test(path))?.[1] || 'Rakshak';

  const renderNav = (compact: boolean) => (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => {
        const items = g.items.filter((i) => i.show);
        if (items.length === 0) return null;
        return (
          <div key={g.title}>
            {!compact && <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{g.title}</div>}
            <div className="space-y-1">
              {items.map((i) => {
                const active = i.match(path);
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    title={compact ? i.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    } ${compact ? 'justify-center' : ''}`}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-1 animate-scale-in rounded-r-full bg-brand-600" />}
                    <span className={`shrink-0 transition ${active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-700'}`}>{i.icon}</span>
                    {!compact && <span className="truncate">{i.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  // Co-Branded Top-Left Identity: [Industry Logo] Industry Name + Powered By Spandan IT Professionals Operations
  const brand = (compact: boolean) => (
    <div
      title={`${brandInfo.name}${brandInfo.address ? ' · ' + brandInfo.address : ''} — Powered by Spandan IT Professionals`}
      className={`group relative flex h-16 items-center gap-3 border-b border-slate-100 px-3.5 ${compact ? 'justify-center' : ''}`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
        {brandInfo.logoUrl ? (
          <img
            src={brandInfo.logoUrl}
            alt={brandInfo.name}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 text-white">
            <Shield className="h-5 w-5" />
          </div>
        )}
      </div>
      {!compact && (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-extrabold tracking-tight text-slate-900">
            {brandInfo.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-blue-600">
            <Shield className="h-3 w-3 shrink-0" />
            <span className="truncate">Powered By Spandan IT Professionals</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-300 md:flex ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        {brand(collapsed)}
        {renderNav(collapsed)}
        <div className="border-t border-slate-100 p-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-fade-in flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              {brand(false)}
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            {renderNav(false)}
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-300 ${collapsed ? 'md:pl-[76px]' : 'md:pl-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md md:px-6 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900 md:text-lg">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right text-xs leading-tight text-slate-500 sm:block">
              <div className="font-semibold text-slate-700">{now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              <div>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
            </div>

            <div className="relative">
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 transition hover:border-brand-300 hover:shadow-soft"
                aria-haspopup="menu"
                aria-expanded={menu}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
                  {initials(user?.full_name)}
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block max-w-[140px] truncate text-xs font-bold text-slate-900">{user?.full_name || 'Admin'}</span>
                  <span className="block max-w-[140px] truncate text-[10px] text-slate-400">{tierLabel(user)}</span>
                </span>
              </button>

              {menu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-60 animate-scale-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift" role="menu">
                    <div className="border-b border-slate-100 p-4">
                      <div className="truncate text-sm font-bold text-slate-900">{user?.full_name || 'Admin'}</div>
                      <div className="truncate text-xs text-slate-500">{tierLabel(user)}</div>
                    </div>
                    <button onClick={onLogout} className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50" role="menuitem">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main key={path} className="animate-fade-in">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
