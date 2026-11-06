import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Footprints, ScanLine, AlertTriangle, CheckCircle2, Users, RefreshCw, ArrowUpRight, Clock, Radio,
} from 'lucide-react';

const API = `${(import.meta as any).env?.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev'}/api/v1`;

interface RouteRow { id: string; name: string; status: 'DONE' | 'IN_PROGRESS' | 'PAUSED' | 'PARTIAL' | 'PENDING'; done_by: string | null; done_at: string | null; on_it: string[]; paused_by?: string[]; progress?: { scanned: number; total: number } }
interface Summary {
  generated_at: string;
  guards: { total: number; active: number; guests: number } | null;
  patrol: { routes_total: number; routes_done: number; routes_in_progress: number; routes_paused?: number; routes_partial?: number; routes_pending: number; active_guards: number; scans_today: number; routes: RouteRow[] } | null;
  incidents: {
    total: number; resolved: number; open: number;
    open_by_priority: Record<string, number>;
    last7: { date: string; count: number }[];
    recent: { id: string; case_number: number | null; title: string; priority: string; status: string; reported_at: string; reporter: string | null }[];
  } | null;
}

const fmtTime = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
};
const caseCode = (n: number | null, id: string) => (n ? `RKS-${String(n).padStart(6, '0')}` : `#${id.slice(0, 6)}`);

/** Numbers glide up to their value, so changes are noticeable. */
function useCountUp(target: number, ms = 700) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(begin + (target - begin) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

const Stat: React.FC<{ to: string; label: string; value: number; suffix?: string; hint: string; icon: React.ReactNode; tone: string; delay: number }> = ({ to, label, value, suffix, hint, icon, tone, delay }) => {
  const v = useCountUp(value);
  return (
    <Link to={to} style={{ animationDelay: `${delay}ms` }} className="card card-hover group animate-slide-up p-5">
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
        <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-brand-600" />
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight text-slate-900">{v}</span>
        {suffix && <span className="text-lg font-bold text-slate-400">{suffix}</span>}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-slate-700">{label}</div>
      <div className="text-xs text-slate-400">{hint}</div>
    </Link>
  );
};

const Ring: React.FC<{ done: number; total: number }> = ({ done, total }) => {
  const pct = total > 0 ? done / total : 0;
  const r = 52, c = 2 * Math.PI * r;
  const [offset, setOffset] = useState(c);
  useEffect(() => { const t = setTimeout(() => setOffset(c * (1 - pct)), 80); return () => clearTimeout(t); }, [pct, c]);
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#10b981" /></linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-extrabold text-slate-900">{Math.round(pct * 100)}%</div>
        <div className="text-[11px] font-semibold text-slate-400">{done} of {total} done</div>
      </div>
    </div>
  );
};

const WeekChart: React.FC<{ data: { date: string; count: number }[] }> = ({ data }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex h-44 items-end gap-2.5">
        {data.map((d, i) => {
          const h = Math.max(4, (d.count / max) * 100);
          const label = new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
          return (
            <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {hover === i && (
                <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full animate-scale-in whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
                  {d.count} incident{d.count === 1 ? '' : 's'}
                </div>
              )}
              <div className={`origin-bottom animate-grow-y rounded-t-lg transition-all duration-200 ${hover === i ? 'bg-brand-600' : 'bg-brand-300'} ${d.count === 0 ? '!bg-slate-200' : ''}`} style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }} />
              <div className="mt-2 text-center text-[11px] font-semibold text-slate-400">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PRIORITY: { key: string; label: string; bar: string }[] = [
  { key: 'P1', label: 'P1 · Critical', bar: 'bg-rose-500' },
  { key: 'P2', label: 'P2 · High', bar: 'bg-orange-500' },
  { key: 'P3', label: 'P3 · Moderate', bar: 'bg-amber-400' },
  { key: 'P4', label: 'P4 · Low', bar: 'bg-slate-400' },
];

const STATUS_STYLE: Record<RouteRow['status'], { chip: string; label: string; dot: string }> = {
  DONE: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Done', dot: 'bg-emerald-500' },
  IN_PROGRESS: { chip: 'bg-amber-50 text-amber-700 border-amber-200', label: 'In progress', dot: 'bg-amber-500' },
  PAUSED: { chip: 'bg-sky-50 text-sky-700 border-sky-200', label: 'Paused', dot: 'bg-sky-500' },
  PARTIAL: { chip: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Partly done', dot: 'bg-orange-500' },
  PENDING: { chip: 'bg-slate-50 text-slate-600 border-slate-200', label: 'Not started', dot: 'bg-slate-300' },
};

export const OverviewPage: React.FC = () => {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [spin, setSpin] = useState(false);
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();

  const load = useCallback(async (manual = false) => {
    if (manual) setSpin(true);
    try {
      const r = await fetch(`${API}/dashboard/summary`);
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Could not load the overview');
      setData(d);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not load the overview');
    } finally {
      setLoading(false);
      setTimeout(() => setSpin(false), 400);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 30000); // stays live without anyone pressing refresh
    return () => clearInterval(t);
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (user?.full_name || '').split(' ')[0];

  const p = data?.patrol, inc = data?.incidents, g = data?.guards;
  const openTotal = inc ? (Object.values(inc.open_by_priority) as number[]).reduce((a: number, b: number) => a + b, 0) || 1 : 1;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 p-4 md:p-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-slide-up">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{greeting}{first ? `, ${first}` : ''} 👋</h2>
          <p className="text-sm text-slate-500">Here is what is happening across your sites right now.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
            Live{data ? ` · ${fmtTime(data.generated_at)}` : ''}
          </span>
          <button onClick={() => load(true)} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-brand-300 hover:text-brand-700">
            <RefreshCw className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">
          <span>{error}</span>
          <button onClick={() => load(true)} className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-rose-700 shadow-sm">Try again</button>
        </div>
      )}

      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-36" />)}
        </div>
      )}

      {data && (
        <>
          {/* KPIs: only modules the industry bought appear */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {p && <Stat to="/reports" label="Routes completed today" value={p.routes_done} suffix={`/${p.routes_total}`} hint={`${p.routes_in_progress} in progress${p.routes_paused ? ', ' + p.routes_paused + ' paused' : ''}`} icon={<CheckCircle2 className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-600" delay={0} />}
            {p && <Stat to="/reports" label="Guards on patrol" value={p.active_guards} hint="Walking a route right now" icon={<Footprints className="h-5 w-5" />} tone="bg-brand-50 text-brand-600" delay={70} />}
            {p && <Stat to="/reports" label="Checkpoints scanned" value={p.scans_today} hint="Since midnight" icon={<ScanLine className="h-5 w-5" />} tone="bg-violet-50 text-violet-600" delay={140} />}
            {inc && <Stat to="/incidents" label="Open incidents" value={inc.open} hint={`${inc.resolved} resolved in total`} icon={<AlertTriangle className="h-5 w-5" />} tone={inc.open > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'} delay={210} />}
            {!p && !inc && g && <Stat to="/guards" label="People" value={g.total} hint={`${g.active} active`} icon={<Users className="h-5 w-5" />} tone="bg-brand-50 text-brand-600" delay={0} />}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Route board */}
            {p && (
              <section className="card animate-slide-up p-5 lg:col-span-2" style={{ animationDelay: '120ms' }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Today's routes</h3>
                    <p className="text-xs text-slate-400">Shared status — every guard sees the same board</p>
                  </div>
                  <Link to="/qr-generator" className="text-xs font-bold text-brand-600 hover:underline">Manage routes</Link>
                </div>
                {p.routes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">No routes yet. Create one in Routes &amp; QR codes.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {p.routes.map((r, i) => (
                      <li key={r.id} className="flex animate-fade-in items-center gap-3 py-3" style={{ animationDelay: `${i * 40}ms` }}>
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_STYLE[r.status].dot} ${r.status === 'IN_PROGRESS' ? 'animate-pulse' : ''}`} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-900">{r.name}</div>
                          <div className="truncate text-xs text-slate-400">
                            {r.status === 'DONE' ? `Completed by ${r.done_by || 'a guard'}${r.done_at ? ' at ' + fmtTime(r.done_at) : ''}`
                              : r.status === 'IN_PROGRESS' ? `On it now: ${r.on_it.join(', ')}`
                              : r.status === 'PAUSED' ? `Paused by ${(r.paused_by || []).join(', ') || 'a guard'}`
                              : r.status === 'PARTIAL' ? `${r.progress?.scanned ?? 0} of ${r.progress?.total ?? 0} checkpoints done. Needs a guard to continue`
                              : 'Waiting for a guard'}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[r.status].chip}`}>{STATUS_STYLE[r.status].label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Completion ring */}
            {p && (
              <section className="card animate-slide-up p-5" style={{ animationDelay: '180ms' }}>
                <h3 className="text-base font-extrabold text-slate-900">Coverage today</h3>
                <p className="mb-4 text-xs text-slate-400">Routes finished vs. planned</p>
                <Ring done={p.routes_done} total={p.routes_total} />
                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  {[['Done', p.routes_done, 'text-emerald-600'], ['Active', p.routes_in_progress, 'text-amber-600'], ['Waiting', p.routes_pending + (p.routes_partial || 0) + (p.routes_paused || 0), 'text-slate-500']].map(([l, v, c]) => (
                    <div key={String(l)} className="rounded-xl bg-slate-50 py-2.5">
                      <div className={`text-lg font-extrabold ${c}`}>{v}</div>
                      <div className="text-[11px] font-semibold text-slate-400">{l}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Incident trend */}
            {inc && (
              <section className="card animate-slide-up p-5 lg:col-span-2" style={{ animationDelay: '240ms' }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Incidents, last 7 days</h3>
                    <p className="text-xs text-slate-400">Hover a bar for the number</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{inc.last7.reduce((a, b) => a + b.count, 0)} total</span>
                </div>
                <WeekChart data={inc.last7} />
              </section>
            )}

            {/* Open by priority */}
            {inc && (
              <section className="card animate-slide-up p-5" style={{ animationDelay: '300ms' }}>
                <h3 className="text-base font-extrabold text-slate-900">Open by priority</h3>
                <p className="mb-4 text-xs text-slate-400">What needs attention first</p>
                <div className="space-y-4">
                  {PRIORITY.map((pr) => {
                    const n = inc.open_by_priority[pr.key] || 0;
                    return (
                      <div key={pr.key}>
                        <div className="mb-1.5 flex justify-between text-xs font-bold"><span className="text-slate-600">{pr.label}</span><span className="text-slate-900">{n}</span></div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full origin-left animate-grow-x rounded-full ${pr.bar}`} style={{ width: `${(n / openTotal) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Recent incidents */}
            {inc && (
              <section className="card animate-slide-up p-5 lg:col-span-3" style={{ animationDelay: '360ms' }}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-slate-900">Latest incidents</h3>
                  <Link to="/incidents" className="text-xs font-bold text-brand-600 hover:underline">Open the queue</Link>
                </div>
                {inc.recent.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Nothing reported yet. Quiet day.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {inc.recent.map((r) => (
                      <Link key={r.id} to={`/incidents/${encodeURIComponent(r.id)}`} className="group flex items-center gap-3 py-3 transition hover:bg-slate-50 sm:px-2 sm:-mx-2 sm:rounded-xl">
                        <span className={`rounded-lg px-2 py-1 text-[11px] font-extrabold ${String(r.priority).startsWith('P1') ? 'bg-rose-100 text-rose-700' : String(r.priority).startsWith('P2') ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{String(r.priority).slice(0, 2)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-900 group-hover:text-brand-700">{r.title}</div>
                          <div className="truncate text-xs text-slate-400">{caseCode(r.case_number, r.id)} · {r.reporter || 'Unknown'} · <Clock className="-mt-0.5 inline h-3 w-3" /> {fmtTime(r.reported_at)}</div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.status}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {g && (
            <div className="flex animate-fade-in items-center gap-2 text-xs text-slate-400">
              <Radio className="h-3.5 w-3.5" /> {g.total} field users · {g.active} active · {g.guests} joined from the Field app
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OverviewPage;
