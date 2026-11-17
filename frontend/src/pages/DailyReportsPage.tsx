import React, { useCallback, useEffect, useState } from 'react';
import {
  Mail, Plus, Trash2, Eye, Send, Save, X, Clock, CheckCircle2,
  AlertTriangle, Loader2, Download, MapPin, Users, Calendar, ShieldAlert,
  FileSpreadsheet, Filter, Monitor, Smartphone, SlidersHorizontal, Radio,
  RefreshCw, ChevronDown, ChevronUp, Sparkles, Check
} from 'lucide-react';

const API = `${(import.meta as any).env?.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev'}/api/v1`;

type ReportCategory = 'route_completion' | 'individual' | 'shift' | 'daily' | 'weekly' | 'monthly' | 'incident';

interface Shift { name: string; start: string; end: string }
interface GuardOption { guard_id: string; full_name: string; employee_code?: string }
interface RouteOption { id: string; name: string }
interface ScheduleRule { enabled: boolean; emails: string }
interface LogRow {
  guard_id?: string;
  guard_name?: string;
  shift_name: string;
  report_date: string;
  status: string;
  recipients: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

const REPORT_TYPES: {
  key: ReportCategory;
  title: string;
  shortTitle: string;
  subtitle: string;
  frequency: string;
  badge?: string;
  accent: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    key: 'route_completion',
    title: 'Route Completion Report (Auto on Finish)',
    shortTitle: 'Route Completion',
    subtitle: 'Sent immediately when a guard finishes a route—includes route map, GPS logs, and only incidents logged by that guard during that run.',
    frequency: 'Instant upon route completion',
    badge: 'Guard-Isolated + Map',
    accent: 'emerald',
    icon: CheckCircle2,
  },
  {
    key: 'shift',
    title: 'Shift-Wise Patrol & Route Map Report',
    shortTitle: 'Shift Patrol & Map',
    subtitle: 'Shift execution breakdown with Expected QR vs Guard Capture GPS route map and drift telemetry.',
    frequency: 'After each shift ends',
    badge: 'Includes Map',
    accent: 'sky',
    icon: MapPin,
  },
  {
    key: 'individual',
    title: 'Individual Guard Dossier Report',
    shortTitle: 'Guard Dossier',
    subtitle: 'All patrol runs, verified QR GPS coordinates, route map, and incidents for the selected guard.',
    frequency: 'Daily at configured time or On-Demand',
    accent: 'indigo',
    icon: Users,
  },
  {
    key: 'daily',
    title: 'Daily Consolidated Digest',
    shortTitle: 'Daily Digest',
    subtitle: 'Complete 24-hour site overview with KPIs, route completion, GPS logs, and multi-tab Excel workbook.',
    frequency: 'Once daily (Default 8:00 PM)',
    accent: 'blue',
    icon: Calendar,
  },
  {
    key: 'weekly',
    title: 'Weekly Management Summary',
    shortTitle: 'Weekly Summary',
    subtitle: '7-day or custom date-range compliance and patrol performance summary.',
    frequency: 'Every Sunday at configured time',
    accent: 'violet',
    icon: FileSpreadsheet,
  },
  {
    key: 'monthly',
    title: 'Monthly Audit & Operations Report',
    shortTitle: 'Monthly Audit',
    subtitle: 'Full 30-day or custom month patrol attendance, GPS verification rate, and compliance audit trail.',
    frequency: '1st of every month at configured time',
    accent: 'slate',
    icon: FileSpreadsheet,
  },
  {
    key: 'incident',
    title: 'Incident & Exception Report',
    shortTitle: 'Incident Alerts',
    subtitle: 'All logged P1–P4 security, fire, safety, and equipment incidents in the selected date window.',
    frequency: 'Daily at configured time',
    accent: 'rose',
    icon: ShieldAlert,
  },
];

const DEFAULT_SCHEDULES: Record<ReportCategory, ScheduleRule> = {
  route_completion: { enabled: true, emails: '' },
  individual: { enabled: true, emails: '' },
  shift: { enabled: true, emails: '' },
  daily: { enabled: true, emails: '' },
  weekly: { enabled: false, emails: '' },
  monthly: { enabled: false, emails: '' },
  incident: { enabled: true, emails: '' },
};

const PRESET: Shift[] = [
  { name: 'Morning', start: '06:00', end: '14:00' },
  { name: 'Evening', start: '14:00', end: '22:00' },
  { name: 'Night', start: '22:00', end: '06:00' },
];

const STATUS_BADGE: Record<string, string> = {
  SENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  SKIPPED: 'bg-slate-50 text-slate-600 border-slate-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const parseEmailList = (raw: string): string[] =>
  String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const post = (path: string, body: any) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const EmailTagInput: React.FC<{
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Add email & press Enter...' }) => {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const tags = parseEmailList(value);

  const commitTag = (raw: string) => {
    const candidates = parseEmailList(raw);
    if (candidates.length === 0) return;
    const next = [...tags];
    for (const c of candidates) {
      if (!isValidEmail(c)) {
        setErr(`Invalid email: ${c}`);
        return;
      }
      if (!next.some((t) => t.toLowerCase() === c.toLowerCase())) {
        next.push(c);
      }
    }
    setErr('');
    setDraft('');
    onChange(next.join(', '));
  };

  const removeTag = (idx: number) => {
    const next = tags.filter((_, i) => i !== idx);
    onChange(next.join(', '));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 transition focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/15">
        {tags.map((email, idx) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700"
          >
            <Mail className="h-3 w-3 text-brand-500" />
            {email}
            <button
              type="button"
              onClick={() => removeTag(idx)}
              className="ml-0.5 rounded p-0.5 text-brand-500 hover:bg-brand-100 hover:text-brand-800"
              aria-label={`Remove ${email}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (err) setErr('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
              if (draft.trim()) {
                e.preventDefault();
                commitTag(draft);
              }
            } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
              removeTag(tags.length - 1);
            }
          }}
          onBlur={() => {
            if (draft.trim()) commitTag(draft);
          }}
          placeholder={tags.length === 0 ? placeholder : 'Add another...'}
          className="min-w-[11rem] flex-1 bg-transparent py-1 text-xs text-slate-800 outline-none placeholder:text-slate-400"
        />
      </div>
      {err && <div className="mt-1 text-[11px] font-semibold text-rose-600">{err}</div>}
    </div>
  );
};

export const DailyReportsPage: React.FC = () => {
  const modules = (() => {
    try {
      return JSON.parse(localStorage.getItem('visible_modules') || '{}');
    } catch {
      return {};
    }
  })();
  const gmailOn = modules.integration_gmail === true;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string>('');
  const [enabled, setEnabled] = useState(true);
  const [sendTime, setSendTime] = useState('20:00');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [delay, setDelay] = useState('15');
  const [emails, setEmails] = useState('');
  const [toSupervisor, setToSupervisor] = useState(true);
  const [schedules, setSchedules] = useState<Record<ReportCategory, ScheduleRule>>(DEFAULT_SCHEDULES);
  const [routeEmailsMap, setRouteEmailsMap] = useState<Record<string, string>>({});
  const [log, setLog] = useState<LogRow[]>([]);
  const [dirty, setDirty] = useState(false);

  // Studio UI State
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('route_completion');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [livePreview, setLivePreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showRouteOverrides, setShowRouteOverrides] = useState(false);
  const [showShiftDrawer, setShowShiftDrawer] = useState(false);

  // Interactive Telemetry Filters
  const [dateFrom, setDateFrom] = useState<string>(todayISO());
  const [dateTo, setDateTo] = useState<string>(todayISO());
  const [activeQuickDays, setActiveQuickDays] = useState<number>(1);
  const [selectedGuardId, setSelectedGuardId] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [guardsList, setGuardsList] = useState<GuardOption[]>([]);
  const [routesList, setRoutesList] = useState<RouteOption[]>([]);

  const token = localStorage.getItem('token');
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const loadLog = useCallback(() => {
    fetch(`${API}/daily-reports/log`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => setLog(d.log || []))
      .catch(() => {});
  }, []);

  const fetchLivePreview = useCallback(
    async (category: ReportCategory, dFrom: string, dTo: string, gId: string, sName: string) => {
      setPreviewLoading(true);
      try {
        const d = await post('/daily-reports/send-now', {
          report_type: category,
          preview: true,
          date_from: dFrom || undefined,
          date_to: dTo || undefined,
          guard_id: gId || undefined,
          shift_name: sName || undefined,
        });
        if (d.success && d.html) {
          setLivePreview({ subject: d.subject || 'Patrol Report Preview', html: d.html });
        }
      } catch {
        // Keep previous preview if transient error occurs
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    Promise.all([
      fetch(`${API}/admin/configs`, { headers: authHeaders }).then((r) => r.json()),
      fetch(`${API}/guards`, { headers: authHeaders }).then((r) => r.json()).catch(() => ({ guards: [] })),
      fetch(`${API}/rounds`, { headers: authHeaders }).then((r) => r.json()).catch(() => ({ rounds: [] })),
    ])
      .then(([d, gRes, rRes]) => {
        const cfg: Record<string, string> = {};
        for (const row of d.configs || []) cfg[row.key_name] = row.key_value;
        setEnabled(cfg.DAILY_REPORT_ENABLED !== 'false');
        setSendTime(cfg.DAILY_REPORT_SEND_TIME || '20:00');
        try {
          setShifts(JSON.parse(cfg.DAILY_REPORT_SHIFTS || '[]'));
        } catch {
          setShifts([]);
        }
        setDelay(cfg.DAILY_REPORT_DELAY_MIN || '15');
        setEmails(cfg.DAILY_REPORT_EMAILS || '');
        setToSupervisor(cfg.DAILY_REPORT_TO_SUPERVISOR !== 'false');
        if (cfg.REPORT_SCHEDULES_JSON) {
          try {
            const parsed = JSON.parse(cfg.REPORT_SCHEDULES_JSON);
            setSchedules({ ...DEFAULT_SCHEDULES, ...parsed });
          } catch {}
        }
        if (cfg.ROUTE_COMPLETION_EMAILS_JSON) {
          try {
            setRouteEmailsMap(JSON.parse(cfg.ROUTE_COMPLETION_EMAILS_JSON));
          } catch {}
        }
        setGuardsList(gRes.guards || gRes.data || []);
        setRoutesList(rRes.rounds || rRes.routes || rRes.data || []);
      })
      .catch(() => alert('Could not load report settings.'))
      .finally(() => setLoading(false));
    loadLog();
  }, [loadLog]);

  // Automatically refresh the right-hand Live Studio Preview when channel or telemetry filter changes
  useEffect(() => {
    if (!loading) {
      fetchLivePreview(activeCategory, dateFrom, dateTo, selectedGuardId, selectedShift);
    }
  }, [loading, activeCategory, dateFrom, dateTo, selectedGuardId, selectedShift, fetchLivePreview]);

  const updateSchedule = (key: ReportCategory, patch: Partial<ScheduleRule>) => {
    setSchedules((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setDirty(true);
  };

  const updateRouteEmail = (routeId: string, val: string) => {
    setRouteEmailsMap((prev) => ({ ...prev, [routeId]: val }));
    setDirty(true);
  };

  const updateShift = (i: number, patch: Partial<Shift>) => {
    setShifts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const applyQuickRange = (days: number) => {
    setActiveQuickDays(days);
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 86400000);
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(end.toISOString().slice(0, 10));
  };

  const save = async () => {
    const clean = shifts
      .filter((s) => s.name.trim() && s.start && s.end)
      .map((s) => ({ name: s.name.trim(), start: s.start, end: s.end }));
    setSaving(true);
    try {
      const d = await post('/admin/configs', [
        { key_name: 'DAILY_REPORT_ENABLED', key_value: enabled ? 'true' : 'false' },
        { key_name: 'DAILY_REPORT_SEND_TIME', key_value: sendTime || '20:00' },
        { key_name: 'DAILY_REPORT_SHIFTS', key_value: JSON.stringify(clean) },
        { key_name: 'DAILY_REPORT_DELAY_MIN', key_value: String(Math.max(0, Math.min(180, Number(delay) || 15))) },
        { key_name: 'DAILY_REPORT_EMAILS', key_value: emails.trim() },
        { key_name: 'DAILY_REPORT_TO_SUPERVISOR', key_value: toSupervisor ? 'true' : 'false' },
        { key_name: 'REPORT_SCHEDULES_JSON', key_value: JSON.stringify(schedules) },
        { key_name: 'ROUTE_COMPLETION_EMAILS_JSON', key_value: JSON.stringify(routeEmailsMap) },
      ]);
      if (!d.success) throw new Error(d.message);
      setShifts(clean);
      setDirty(false);
    } catch (e: any) {
      alert(e.message || 'Could not save report settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleReportAction = async (reportType: ReportCategory, mode: 'preview' | 'download' | 'send') => {
    const key = `${reportType}:${mode}`;
    setActionBusy(key);
    try {
      const recipients = schedules[reportType]?.emails?.trim() || emails.trim();
      if (mode === 'send' && !recipients) {
        alert('Add at least one recipient email tag for this report channel first.');
        return;
      }
      const d = await post('/daily-reports/send-now', {
        report_type: reportType,
        preview: mode === 'preview',
        download: mode === 'download',
        recipients,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        guard_id: selectedGuardId || undefined,
        shift_name: selectedShift || undefined,
      });
      if (!d.success) throw new Error(d.message);

      if (mode === 'preview') {
        setActiveCategory(reportType);
        setLivePreview({ subject: d.subject, html: d.html });
      } else if (mode === 'download') {
        const byteChars = atob(d.excelBase64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.filename || `${reportType}_report.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        alert(d.message || 'Report dispatched to Gmail recipients.');
        loadLog();
      }
    } catch (e: any) {
      alert(e.message || 'Report action failed.');
    } finally {
      setActionBusy('');
    }
  };

  const activeMeta = REPORT_TYPES.find((r) => r.key === activeCategory) || REPORT_TYPES[0];
  const sentTodayCount = log.filter((l) => l.status === 'SENT' && l.report_date === todayISO()).length;
  const activeChannelCount = Object.values(schedules).filter((s) => s.enabled).length;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-4 md:p-6">
      {/* Studio Command Header & Telemetry Ribbon */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-300">
              <Radio className={`h-3 w-3 ${enabled ? 'animate-pulse text-emerald-400' : 'text-slate-400'}`} />
              Automated Dispatch &amp; Telemetry Studio
            </div>
            <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">
              Patrol Reporting &amp; GPS Verification Center
            </h1>
            <p className="text-xs text-slate-400">
              Configure guard-isolated route completion alerts, scheduled shift digests, and multi-sheet Excel exports with live email &amp; map inspection.
            </p>
          </div>

          {/* Engine Status & Quick KPIs */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">Active Channels</div>
              <div className="text-base font-extrabold text-sky-400">{activeChannelCount} / {REPORT_TYPES.length}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">Dispatched Today</div>
              <div className="text-base font-extrabold text-emerald-400">{sentTodayCount}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2">
              <div className="text-[10px] font-bold uppercase text-slate-400">Master Engine</div>
              <button
                type="button"
                onClick={() => {
                  setEnabled((v) => !v);
                  setDirty(true);
                }}
                className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold transition ${
                  enabled
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                {enabled ? 'LIVE & ARMED' : 'PAUSED'}
              </button>
            </div>
          </div>
        </div>

        {!gmailOn && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Gmail OAuth integration is currently inactive. Connect Gmail under <strong>Integrations</strong> to enable automated email delivery.
            </span>
          </div>
        )}
      </div>

      {/* Telemetry Scope & Filter Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            <Filter className="h-3.5 w-3.5 text-brand-600" />
            Report Scope:
          </span>
          {[
            { label: 'Today', days: 1 },
            { label: 'Last 7 Days', days: 7 },
            { label: 'Last 30 Days', days: 30 },
          ].map((q) => (
            <button
              key={q.days}
              type="button"
              onClick={() => applyQuickRange(q.days)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                activeQuickDays === q.days
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {q.label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setActiveQuickDays(0);
              }}
              className="bg-transparent font-medium text-slate-700 outline-none"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setActiveQuickDays(0);
              }}
              className="bg-transparent font-medium text-slate-700 outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedGuardId}
            onChange={(e) => setSelectedGuardId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 focus:bg-white"
          >
            <option value="">All Guards (Site-Wide)</option>
            {guardsList.map((g) => (
              <option key={g.guard_id} value={g.guard_id}>
                {g.full_name} {g.employee_code ? `(${g.employee_code})` : ''}
              </option>
            ))}
          </select>

          <select
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 focus:bg-white"
          >
            <option value="">All Shifts</option>
            {(shifts.length > 0 ? shifts : PRESET).map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.start}–{s.end})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Split-Screen Studio Workspace: Left Config Channels | Right Live Email & Map Preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: 7 Report Channels + Per-Route Overrides + Shift & Fallback Drawer */}
        <div className="space-y-4 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              1. Report Channels &amp; Recipient Rules
            </h2>
            <span className="text-[11px] text-slate-400">Click any channel to inspect live preview</span>
          </div>

          <div className="space-y-3">
            {REPORT_TYPES.map((rt) => {
              const Icon = rt.icon;
              const rule = schedules[rt.key] || { enabled: false, emails: '' };
              const isSelected = activeCategory === rt.key;
              return (
                <div
                  key={rt.key}
                  onClick={() => setActiveCategory(rt.key)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? 'border-brand-500 bg-white shadow-md ring-2 ring-brand-500/15'
                      : 'border-slate-200 bg-white/90 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isSelected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-extrabold text-slate-900">{rt.title}</h3>
                          {rt.badge && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                              {rt.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{rt.subtitle}</p>
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                          <Clock className="h-3 w-3" />
                          {rt.frequency}
                        </div>
                      </div>
                    </div>

                    {/* Auto-Dispatch Toggle */}
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => updateSchedule(rt.key, { enabled: e.target.checked })}
                        className="h-3.5 w-3.5 accent-brand-600"
                      />
                      {rule.enabled ? 'Auto' : 'Off'}
                    </label>
                  </div>

                  {/* Recipient Tag Input + Quick Action Buttons */}
                  <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
                    <EmailTagInput
                      value={rule.emails}
                      onChange={(val) => updateSchedule(rt.key, { emails: val })}
                      placeholder="Type recipient email & press Enter (e.g. manager@site.com)..."
                    />

                    {/* Collapsible Per-Route Overrides for Route Completion */}
                    {rt.key === 'route_completion' && routesList.length > 0 && (
                      <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5">
                        <button
                          type="button"
                          onClick={() => setShowRouteOverrides((v) => !v)}
                          className="flex w-full items-center justify-between text-xs font-bold text-slate-700"
                        >
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                            Per-Route Recipient Overrides ({routesList.length} routes)
                          </span>
                          {showRouteOverrides ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {showRouteOverrides && (
                          <div className="mt-2.5 space-y-2 border-t border-slate-200/70 pt-2.5">
                            {routesList.map((route) => (
                              <div key={route.id} className="space-y-1">
                                <div className="text-[11px] font-bold text-slate-600">{route.name}</div>
                                <EmailTagInput
                                  value={routeEmailsMap[String(route.id)] || ''}
                                  onChange={(val) => updateRouteEmail(String(route.id), val)}
                                  placeholder={`Custom recipients for ${route.name}...`}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReportAction(rt.key, 'preview')}
                          disabled={!!actionBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          {actionBusy === `${rt.key}:preview` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 text-brand-600" />
                          )}
                          Preview
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReportAction(rt.key, 'download')}
                          disabled={!!actionBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          {actionBusy === `${rt.key}:download` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                          Excel
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReportAction(rt.key, 'send')}
                        disabled={!!actionBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                      >
                        {actionBusy === `${rt.key}:send` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5 text-sky-400" />
                        )}
                        Send Now
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shift Windows & Global Supervisor/Fallback Drawer */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setShowShiftDrawer((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <SlidersHorizontal className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">Shift Schedules, Supervisor CC &amp; Global Fallback</div>
                  <div className="text-xs text-slate-500">
                    Daily digest at <strong>{sendTime}</strong> · {shifts.length} configured shift(s) · Supervisor auto-CC {toSupervisor ? 'ON' : 'OFF'}
                  </div>
                </div>
              </div>
              {showShiftDrawer ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
            </button>

            {showShiftDrawer && (
              <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Daily Digest Dispatch Time</label>
                    <input
                      type="time"
                      value={sendTime}
                      onChange={(e) => {
                        setSendTime(e.target.value);
                        setDirty(true);
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Post-Shift Buffer Delay (Minutes)</label>
                    <input
                      type="number"
                      min={0}
                      max={180}
                      value={delay}
                      onChange={(e) => {
                        setDelay(e.target.value);
                        setDirty(true);
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Shift Windows</span>
                    <div className="flex items-center gap-2">
                      {shifts.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setShifts(PRESET);
                            setDirty(true);
                          }}
                          className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200"
                        >
                          Load 3-Shift Preset
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShifts((p) => [...p, { name: 'Custom Shift', start: '08:00', end: '16:00' }]);
                          setDirty(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 hover:bg-brand-100"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Shift
                      </button>
                    </div>
                  </div>

                  {shifts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                      No custom shifts configured yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shifts.map((s, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                          <input
                            value={s.name}
                            onChange={(e) => updateShift(i, { name: e.target.value })}
                            placeholder="Shift name"
                            className="min-w-[8rem] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold outline-none focus:border-brand-500"
                          />
                          <input
                            type="time"
                            value={s.start}
                            onChange={(e) => updateShift(i, { start: e.target.value })}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                          />
                          <span className="text-xs text-slate-400">to</span>
                          <input
                            type="time"
                            value={s.end}
                            onChange={(e) => updateShift(i, { end: e.target.value })}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setShifts((p) => p.filter((_, idx) => idx !== i));
                              setDirty(true);
                            }}
                            className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={toSupervisor}
                      onChange={(e) => {
                        setToSupervisor(e.target.checked);
                        setDirty(true);
                      }}
                      className="h-4 w-4 accent-brand-600"
                    />
                    Auto-CC each guard&apos;s assigned supervisor on shift &amp; route-completion emails
                  </label>
                  <div>
                    <div className="mb-1 text-xs font-bold text-slate-600">Global Fallback Recipient(s)</div>
                    <EmailTagInput
                      value={emails}
                      onChange={(val) => {
                        setEmails(val);
                        setDirty(true);
                      }}
                      placeholder="admin@company.com..."
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Live Sticky Email & Map Studio Inspector */}
        <div className="lg:col-span-6">
          <div className="sticky top-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {/* Studio Preview Chrome */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-400" />
                <div>
                  <div className="text-xs font-extrabold tracking-wide">LIVE EMAIL &amp; GPS MAP INSPECTOR</div>
                  <div className="text-[11px] text-slate-400">Channel: {activeMeta.shortTitle}</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${
                      previewDevice === 'desktop' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Monitor className="h-3 w-3" /> Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${
                      previewDevice === 'mobile' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Smartphone className="h-3 w-3" /> Mobile
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => fetchLivePreview(activeCategory, dateFrom, dateTo, selectedGuardId, selectedShift)}
                  disabled={previewLoading}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
                  title="Refresh Live Preview"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${previewLoading ? 'animate-spin text-sky-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Simulated Gmail Subject Header */}
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subject Line</div>
              <div className="truncate text-xs font-extrabold text-slate-900">
                {livePreview?.subject || `[Enterprise Site] ${activeMeta.title} · ${dateTo}`}
              </div>
            </div>

            {/* Responsive Preview Frame */}
            <div className="flex justify-center bg-slate-100/80 p-3">
              {previewLoading && !livePreview ? (
                <div className="flex h-[560px] w-full flex-col items-center justify-center gap-2 text-xs font-semibold text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
                  Rendering live telemetry &amp; route map...
                </div>
              ) : livePreview ? (
                <div
                  className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 ${
                    previewDevice === 'mobile' ? 'w-[375px]' : 'w-full'
                  }`}
                >
                  <iframe
                    title="Live Report Email & Map Preview"
                    srcDoc={livePreview.html}
                    sandbox=""
                    className="h-[600px] w-full bg-white"
                  />
                </div>
              ) : (
                <div className="flex h-[560px] w-full flex-col items-center justify-center gap-3 text-center text-xs text-slate-400">
                  <Eye className="h-8 w-8 text-slate-300" />
                  <div>Click <strong>Preview</strong> on any report channel to inspect its live email &amp; map output.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Save Automation Bar */}
      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {dirty ? 'Save Automation Settings' : 'All Changes Saved'}
          </button>
          <span className="hidden text-xs text-slate-500 sm:inline">
            Daily digest scheduled at <strong>{sendTime}</strong> · Instant route alerts <strong>{schedules.route_completion?.enabled ? 'Active' : 'Off'}</strong>
          </span>
        </div>

        {dirty && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Unsaved changes
          </span>
        )}
      </div>

      {/* Automated & Manual Dispatch Audit Log */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Automated &amp; Manual Dispatch Audit Log</h3>
            <p className="text-xs text-slate-400">Real-time delivery history across Gmail OAuth and automated cron triggers</p>
          </div>
          <button
            type="button"
            onClick={loadLog}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Log
          </button>
        </div>

        {log.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            No reports dispatched yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {log.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 py-2.5">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${r.status === 'SENT' ? 'text-emerald-500' : 'text-rose-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-900">
                    {r.guard_name && r.guard_name !== 'Unknown' ? r.guard_name : r.shift_name}{' '}
                    <span className="font-medium text-slate-400">
                      · {r.shift_name} · {r.report_date}
                    </span>
                  </div>
                  <div className="truncate text-xs text-slate-400">{r.error ? r.error : r.recipients || '—'}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE[r.status] || STATUS_BADGE.PENDING}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default DailyReportsPage;
