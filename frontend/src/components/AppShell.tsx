import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, AlertTriangle, Users, QrCode, Sliders, Building2,
  LogOut, ChevronsLeft, ChevronsRight, Shield, Mail, MoreHorizontal, X,
} from 'lucide-react';

/**
 * Responsive shell — same props and permission logic as before.
 *   phones  (<768px)   : top bar + bottom tab bar (+ "More" sheet when there are >5 items)
 *   tablets (768-1023) : slim icon rail
 *   desktop (≥1024)    : full sidebar, collapsible to the rail
 */
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
  short: string; // label used under the icon on the phone tab bar
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

const ic = 'h-[20px] w-[20px]';

export const AppShell: React.FC<{
  user: any;
  modules: VisibleModules;
  onLogout: () => void;
  children: React.ReactNode;
}> = ({ user, modules, onLogout, children }) => {
  const location = useLocation();
  const path = location.pathname;

  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('sidebar_collapsed') === '1');
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const [now, setNow] = useState(new Date());

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
      setBrandInfo({ name: user?.tenant_name || 'Rakshak Security', logoUrl: user?.tenant_logo_url || null, address: user?.tenant_address || null });
    };
    syncBrand();
    window.addEventListener('rakshak-brand-updated', syncBrand);
    return () => window.removeEventListener('rakshak-brand-updated', syncBrand);
  }, [user]);

  useEffect(() => { localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { setMore(false); setMenu(false); }, [path]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const isSuper = user?.tier === 'SUPER_ADMIN';

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Monitor',
      items: [
        { to: '/overview', label: 'Overview', short: 'Home', icon: <LayoutDashboard className={ic} />, show: !isSuper, match: (p) => p.startsWith('/overview') },
        { to: '/reports', label: 'Patrol reports', short: 'Reports', icon: <FileText className={ic} />, show: modules.module_patrol === true, match: (p) => p.startsWith('/reports') },
        { to: '/incidents', label: 'Incidents', short: 'Incidents', icon: <AlertTriangle className={ic} />, show: modules.module_incidents === true, match: (p) => p.startsWith('/incidents') },
      ],
    },
    {
      title: 'Manage',
      items: [
        { to: '/guards', label: 'People & access', short: 'People', icon: <Users className={ic} />, show: true, match: (p) => p.startsWith('/guards') },
        { to: '/daily-reports', label: 'Daily reports', short: 'Daily', icon: <Mail className={ic} />, show: !isSuper && modules.module_patrol === true && modules.daily_reports === true, match: (p) => p.startsWith('/daily-reports') },
        { to: '/qr-generator', label: 'Routes & QR codes', short: 'QR', icon: <QrCode className={ic} />, show: modules.module_qr_generator === true, match: (p) => p.startsWith('/qr-generator') },
        { to: '/admin/configs', label: 'Integrations', short: 'Setup', icon: <Sliders className={ic} />, show: modules.module_integrations === true, match: (p) => p.startsWith('/admin/configs') },
      ],
    },
    {
      title: 'Platform',
      items: [
        { to: '/platform', label: 'Industries', short: 'Industries', icon: <Building2 className={ic} />, show: isSuper, match: (p) => p.startsWith('/platform') },
      ],
    },
  ];

  const flat = useMemo(() => groups.flatMap((g) => g.items).filter((i) => i.show), [modules, isSuper]); // eslint-disable-line
  const needMore = flat.length > 5;
  const tabs = needMore ? flat.slice(0, 4) : flat;
  const overflow = needMore ? flat.slice(4) : [];
  const overflowActive = overflow.some((i) => i.match(path));

  const title = TITLES.find(([re]) => re.test(path))?.[1] || 'Rakshak';

  /* ---------- desktop / tablet sidebar ---------- */
  // Labels show only on lg+ and only when not collapsed; below lg the sidebar is always a rail.
  const labelCls = collapsed ? 'hidden' : 'hidden lg:inline';
  const railCenter = collapsed ? 'justify-center' : 'justify-center lg:justify-start';

  const sidebarNav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => {
        const items = g.items.filter((i) => i.show);
        if (items.length === 0) return null;
        return (
          <div key={g.title}>
            <div className={`mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 ${collapsed ? 'hidden' : 'hidden lg:block'}`}>{g.title}</div>
            <div className="space-y-1">
              {items.map((i) => {
                const active = i.match(path);
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    title={i.label}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${railCenter} ${
                      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-brand-600" />}
                    <span className={`shrink-0 ${active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-700'}`}>{i.icon}</span>
                    <span className={`truncate ${labelCls}`}>{i.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const logo = (size: string) => (
    <div className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1`}>
      {brandInfo.logoUrl ? (
        <img src={brandInfo.logoUrl} alt={brandInfo.name} loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-800 text-white"><Shield className="h-5 w-5" /></div>
      )}
    </div>
  );

  const userMenu = (
    <div className="relative">
      <button
        onClick={() => setMenu((m) => !m)}
        className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-1 transition hover:border-brand-300 hover:shadow-soft sm:pr-3"
        aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">{initials(user?.full_name)}</span>
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
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Tablet rail + desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-300 md:flex ${collapsed ? 'w-[76px]' : 'w-[76px] lg:w-64'}`}>
        <div className={`flex h-16 items-center gap-3 border-b border-slate-100 px-3.5 ${railCenter}`} title={`${brandInfo.name} — Powered by Spandan IT Professionals`}>
          {logo('h-10 w-10')}
          <div className={`min-w-0 flex-1 leading-tight ${collapsed ? 'hidden' : 'hidden lg:block'}`}>
            <div className="truncate text-sm font-extrabold tracking-tight text-slate-900">{brandInfo.name}</div>
            <div className="mt-0.5 truncate text-[10px] font-semibold text-brand-600">Powered by Spandan IT</div>
          </div>
        </div>
        {sidebarNav}
        <div className="hidden border-t border-slate-100 p-3 lg:block">
          <button onClick={() => setCollapsed((c) => !c)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 ${collapsed ? 'justify-center' : ''}`} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>

      <div className={`transition-[padding] duration-300 ${collapsed ? 'md:pl-[76px]' : 'md:pl-[76px] lg:pl-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur-md sm:h-16 md:px-6 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <div className="md:hidden">{logo('h-9 w-9')}</div>
            <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900 md:text-lg">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-xs leading-tight text-slate-500 lg:block">
              <div className="font-semibold text-slate-700">{now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              <div>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            {userMenu}
          </div>
        </header>

        {/* pb clears the phone tab bar */}
        <main key={path} className="animate-fade-in pb-24 md:pb-0">{children}</main>
      </div>

      {/* Phone bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-nav backdrop-blur md:hidden print:hidden" aria-label="Main">
        <ul className="pb-safe mx-auto flex max-w-xl items-stretch justify-around px-1 pt-1">
          {tabs.map((i) => {
            const active = i.match(path);
            return (
              <li key={i.to} className="flex-1">
                <Link to={i.to} aria-current={active ? 'page' : undefined} className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition ${active ? 'text-brand-700' : 'text-slate-500'}`}>
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${active ? 'bg-brand-100' : ''}`}>{i.icon}</span>
                  <span className="max-w-full truncate px-1">{i.short}</span>
                </Link>
              </li>
            );
          })}
          {needMore && (
            <li className="flex-1">
              <button onClick={() => setMore(true)} className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${overflowActive ? 'text-brand-700' : 'text-slate-500'}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${overflowActive ? 'bg-brand-100' : ''}`}><MoreHorizontal className={ic} /></span>
                More
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* "More" bottom sheet (phones) */}
      {more && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm" onClick={() => setMore(false)} />
          <div className="sheet !rounded-b-none">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-extrabold text-slate-900">More</div>
              <button onClick={() => setMore(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-1">
              {overflow.map((i) => (
                <Link key={i.to} to={i.to} className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm font-semibold ${i.match(path) ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'}`}>
                  {i.icon}{i.label}
                </Link>
              ))}
              <button onClick={onLogout} className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50">
                <LogOut className={ic} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppShell;
