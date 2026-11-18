import React from 'react';
import { Inbox } from 'lucide-react';

/** Page title + optional actions. Stacks on phones, sits in one row from `sm` up. */
export const PageHeader: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h2 className="truncate text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/** Big number with a label — use inside `.grid-auto-sm`. */
export const StatCard: React.FC<{
  label: string; value: React.ReactNode; icon?: React.ReactNode; hint?: string;
  tone?: 'brand' | 'ok' | 'warn' | 'danger';
}> = ({ label, value, icon, hint, tone = 'brand' }) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-600', ok: 'bg-emerald-50 text-emerald-600',
    warn: 'bg-amber-50 text-amber-600', danger: 'bg-rose-50 text-rose-600',
  } as const;
  return (
    <div className="card flex items-center gap-4 p-4 sm:p-5">
      {icon && <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className="truncate text-2xl font-extrabold tracking-tight text-slate-900">{value}</div>
        {hint && <div className="truncate text-xs text-slate-400">{hint}</div>}
      </div>
    </div>
  );
};

const STATUS: Record<string, [string, string]> = {
  DONE: ['badge-ok', 'Done'], COMPLETED: ['badge-ok', 'Completed'], RESOLVED: ['badge-ok', 'Resolved'], OPEN: ['badge-danger', 'Open'],
  IN_PROGRESS: ['badge-warn', 'In progress'], PARTIAL: ['badge-warn', 'Partly done'], PAUSED: ['badge-info', 'Paused'],
  PENDING: ['badge-mute', 'Not started'], P1: ['badge-danger', 'P1 Critical'], P2: ['badge-warn', 'P2 High'], P3: ['badge-info', 'P3 Medium'], P4: ['badge-mute', 'P4 Low'],
};

/** Consistent coloured pill for any status/severity string from the API. */
export const StatusBadge: React.FC<{ status?: string | null; label?: string }> = ({ status, label }) => {
  const key = String(status || 'PENDING').toUpperCase().replace(/\s+/g, '_');
  const [cls, text] = STATUS[key] || ['badge-mute', String(status || '—')];
  return <span className={cls}>{label || text}</span>;
};

export const EmptyState: React.FC<{ title: string; text?: string; action?: React.ReactNode }> = ({ title, text, action }) => (
  <div className="card flex flex-col items-center px-6 py-12 text-center">
    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Inbox className="h-7 w-7" /></div>
    <div className="text-base font-bold text-slate-800">{title}</div>
    {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-24 w-full' }) => <div className={`skeleton ${className}`} />;
