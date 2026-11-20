import React, { useCallback, useEffect, useState } from 'react';
import {
  Mail, Plus, Trash2, Eye, Send, Save, X, Clock, CheckCircle2,
  AlertTriangle, Loader2, Download, MapPin, Users, Calendar, ShieldAlert,
  FileSpreadsheet, Filter, ChevronDown, ChevronUp, RefreshCw, Check,
  ChevronLeft, ChevronRight, Layers, SlidersHorizontal
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
  subtitle: string;
  frequency: string;
  badge?: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    key: 'route_completion',
    title: 'Route Completion Report (Auto on Finish)',
    subtitle: 'Sent immediately when a guard completes a route—includes route map, GPS logs, and only incidents logged by that guard during that route.',
    frequency: 'Instant upon route completion',
    badge: 'Guard-Isolated + Map',
    icon: CheckCircle2,
  },
  {
    key: 'shift',
    title: 'Shift-Wise Patrol & Route Map Report',
    subtitle: 'Shift execution breakdown with attached Expected QR vs Guard Capture GPS route map.',
    frequency: 'After each shift ends',
    badge: 'Includes Map',
    icon: MapPin,
  },
  {
    key: 'individual',
    title: 'Individual Guard Dossier Report',
    subtitle: 'All patrol runs, verified QR GPS coordinates, route map, and incidents for the selected guard.',
    frequency: 'Daily at configured time or On-Demand',
    icon: Users,
  },
  {
    key: 'daily',
    title: 'Daily Consolidated Digest',
    subtitle: 'Complete 24-hour site overview with KPIs, route completion, GPS logs, and Excel workbook.',
    frequency: 'Once daily (Default 8:00 PM)',
    icon: Calendar,
  },
  {
    key: 'weekly',
    title: 'Weekly Management Summary',
    subtitle: '7-day or custom date-range compliance and patrol performance summary.',
    frequency: 'Every Sunday at configured time',
    icon: FileSpreadsheet,
  },
  {
    key: 'monthly',
    title: 'Monthly Audit & Operations Report',
    subtitle: 'Full 30-day or custom month patrol attendance, GPS verification rate, and audit trail.',
    frequency: '1st of every month at configured time',
    icon: FileSpreadsheet,
  },
  {
    key: 'incident',
    title: 'Incident & Exception Report',
    subtitle: 'All logged P1–P4 security, fire, safety, and equipment incidents in the selected date window.',
    frequency: 'Daily at configured time',
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

const STATUS: Record<string, string> = {
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
}> = ({ value, onChange, placeholder = 'Add recipient email & press Enter...' }) => {
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
    onChange(tags.filter((_, i) => i !== idx).join(', '));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 transition focus-within:border-brand-500 focus-within:bg-white">
        {tags.map((email, idx) => (
          <span
            key={email}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
          >
            {email}
            <button
              type="button"
              onClick={() => removeTag(idx)}
              className="rounded p-0.5 text-brand-500 hover:bg-brand-100 hover:text-brand-800"
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
          placeholder={tags.length === 0 ? placeholder : 'Add another email...'}
          className="min-w-[12rem] flex-1 bg-transparent py-1 text-xs text-slate-800 outline-none placeholder:text-slate-400"
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
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showRouteOverrides, setShowRouteOverrides] = useState(false);

  // Clean Telemetry Filters
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
        alert('Enter at least one recipient email address for this report first.');
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
        setPreview({ subject: d.subject, html: d.html });
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
        alert(d.message || 'Report emailed successfully.');
        loadLog();
      }
    } catch (e: any) {
      alert(e.message || 'Report action failed.');
    } finally {
      setActionBusy('');
    }
  };

  const [workspaceView, setWorkspaceView] = useState<'dispatch' | 'automation' | 'logs'>('dispatch');
  const [selectedReportKey, setSelectedReportKey] = useState<ReportCategory | 'ALL'>('daily');
  const [logStatusFilter, setLogStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED'>('ALL');
  const [logPage, setLogPage] = useState<number>(1);
  const [logPageSize, setLogPageSize] = useState<number>(20);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4 p-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const activeRuleCount = Object.values(schedules).filter((r) => r?.enabled).length;
  const sentLogCount = log.filter((r) => r.status === 'SENT').length;
  const failedLogCount = log.filter((r) => r.status === 'FAILED').length;

  const visibleReportTypes =
    selectedReportKey === 'ALL'
      ? REPORT_TYPES
      : REPORT_TYPES.filter((rt) => rt.key === selectedReportKey);

  const filteredLog = log.filter((r) => {
    if (logStatusFilter === 'SENT') return r.status === 'SENT';
    if (logStatusFilter === 'FAILED') return r.status === 'FAILED';
    return true;
  });

  const totalLogRecords = filteredLog.length;
  const totalLogPages = Math.max(1, Math.ceil(totalLogRecords / logPageSize));
  const safeLogPage = Math.min(logPage, totalLogPages);
  const paginatedLog = filteredLog.slice((safeLogPage - 1) * logPageSize, safeLogPage * logPageSize);

  const logPageNumbers: (number | 'ellipsis')[] = [];
  if (totalLogPages <= 7) {
    for (let i = 1; i <= totalLogPages; i++) logPageNumbers.push(i);
  } else {
    logPageNumbers.push(1);
    if (safeLogPage > 3) logPageNumbers.push('ellipsis');
    const start = Math.max(2, safeLogPage - 1);
    const end = Math.min(totalLogPages - 1, safeLogPage + 1);
    for (let i = start; i <= end; i++) logPageNumbers.push(i);
    if (safeLogPage < totalLogPages - 2) logPageNumbers.push('ellipsis');
    logPageNumbers.push(totalLogPages);
  }

  const logStartItem = totalLogRecords === 0 ? 0 : (safeLogPage - 1) * logPageSize + 1;
  const logEndItem = Math.min(totalLogRecords, safeLogPage * logPageSize);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 font-sans text-xs text-slate-800">
      <div className="mx-auto max-w-[1600px] space-y-5">
        {/* Tactical Calm Header with Workspace Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Daily Reports &amp; Automated Digests
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Generate on-demand GPS &amp; patrol reports, configure automated email schedules, or audit delivery logs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Primary Workspace Dropdown */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Layers className="h-3.5 w-3.5 text-brand-600" />
              <span className="text-[11px] font-bold uppercase text-slate-400">Workspace:</span>
              <select
                value={workspaceView}
                onChange={(e) => setWorkspaceView(e.target.value as any)}
                className="bg-transparent text-xs font-extrabold text-slate-900 outline-none"
              >
                <option value="dispatch">On-Demand Dispatch &amp; Report Rules</option>
                <option value="automation">Shift Windows &amp; Global Schedule</option>
                <option value="logs">Delivery History Log ({log.length})</option>
              </select>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  setDirty(true);
                }}
                className="h-3.5 w-3.5 accent-brand-600"
              />
              <span>Auto-Dispatch: {enabled ? 'On' : 'Paused'}</span>
            </label>

            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              ) : dirty ? (
                <Save className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              )}
              {dirty ? 'Save Changes' : 'Saved'}
            </button>
          </div>
        </div>

        {!gmailOn && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Gmail OAuth integration is currently inactive. Connect Gmail under <strong>Integrations</strong> to enable automated email delivery.
            </span>
          </div>
        )}

        {/* 4-Card Summary KPI Strip (Acts as Quick View Switcher) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setWorkspaceView('dispatch')}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              workspaceView === 'dispatch'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold uppercase ${workspaceView === 'dispatch' ? 'text-slate-300' : 'text-slate-500'}`}>
                Active Report Rules
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold">
                {activeRuleCount} <span className="text-xs font-semibold opacity-60">/ {REPORT_TYPES.length}</span>
              </div>
            </div>
            <SlidersHorizontal className={`h-5 w-5 ${workspaceView === 'dispatch' ? 'text-sky-400' : 'text-slate-400'}`} />
          </button>

          <button
            type="button"
            onClick={() => setWorkspaceView('automation')}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              workspaceView === 'automation'
                ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-indigo-700">Daily Digest Cutoff</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{sendTime}</div>
            </div>
            <Clock className="h-5 w-5 text-indigo-600" />
          </button>

          <button
            type="button"
            onClick={() => {
              setWorkspaceView('logs');
              setLogStatusFilter('SENT');
              setLogPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              workspaceView === 'logs' && logStatusFilter === 'SENT'
                ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-emerald-700">Delivered Reports</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{sentLogCount}</div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </button>

          <button
            type="button"
            onClick={() => {
              setWorkspaceView('logs');
              setLogStatusFilter(failedLogCount > 0 ? 'FAILED' : 'ALL');
              setLogPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              workspaceView === 'logs' && logStatusFilter === 'FAILED'
                ? 'border-rose-500 bg-rose-50/70 ring-2 ring-rose-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-rose-700">Delivery Failures</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{failedLogCount}</div>
            </div>
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </button>
        </div>

        {/* VIEW 1: ON-DEMAND DISPATCH & REPORT CATALOG (Dropdown-Focused) */}
        {workspaceView === 'dispatch' && (
          <div className="space-y-4">
            {/* Unified Report & Scope Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Report Type Selector Dropdown */}
                <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/50 px-3 py-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-brand-600" />
                  <span className="text-[11px] font-bold text-brand-700">Report Type:</span>
                  <select
                    value={selectedReportKey}
                    onChange={(e) => setSelectedReportKey(e.target.value as any)}
                    className="bg-transparent text-xs font-extrabold text-slate-900 outline-none"
                  >
                    {REPORT_TYPES.map((rt) => (
                      <option key={rt.key} value={rt.key}>
                        {rt.title}
                      </option>
                    ))}
                    <option value="ALL">Show All 7 Report Rules</option>
                  </select>
                </div>

                <div className="mx-0.5 h-4 w-px bg-slate-200" />

                {/* Date Scope Dropdown */}
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={activeQuickDays}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val > 0) applyQuickRange(val);
                      else setActiveQuickDays(0);
                    }}
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value={1}>Today</option>
                    <option value={7}>Last 7 Days</option>
                    <option value={30}>Last 30 Days</option>
                    <option value={0}>Custom Range</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs">
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
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-brand-500 focus:bg-white"
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
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-brand-500 focus:bg-white"
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

            {/* Selected Report Card(s) */}
            <div className="space-y-3">
              {visibleReportTypes.map((rt) => {
                const Icon = rt.icon;
                const rule = schedules[rt.key] || { enabled: false, emails: '' };
                return (
                  <div
                    key={rt.key}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-extrabold text-slate-900">{rt.title}</h2>
                            {rt.badge && (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                {rt.badge}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">{rt.subtitle}</p>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                            <Clock className="h-3 w-3" />
                            Schedule: <strong className="text-slate-600">{rt.frequency}</strong>
                          </div>
                        </div>
                      </div>

                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateSchedule(rt.key, { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 accent-brand-600"
                        />
                        {rule.enabled ? 'Auto-Send Enabled' : 'Auto-Send Off'}
                      </label>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                      <div className="flex-1">
                        <EmailTagInput
                          value={rule.emails}
                          onChange={(val) => updateSchedule(rt.key, { emails: val })}
                          placeholder="Type recipient email & press Enter (e.g. manager@site.com)..."
                        />
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleReportAction(rt.key, 'preview')}
                          disabled={!!actionBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
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
                          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          {actionBusy === `${rt.key}:download` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Export Excel
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReportAction(rt.key, 'send')}
                          disabled={!!actionBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                        >
                          {actionBusy === `${rt.key}:send` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                          ) : (
                            <Send className="h-3.5 w-3.5 text-emerald-400" />
                          )}
                          Send Now
                        </button>
                      </div>
                    </div>

                    {/* Optional Per-Route Override Drawer inside Route Completion Card */}
                    {rt.key === 'route_completion' && routesList.length > 0 && (
                      <div className="mt-3 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowRouteOverrides((v) => !v)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          {showRouteOverrides ? 'Hide' : 'Configure'} per-route recipient overrides ({routesList.length} routes)
                          {showRouteOverrides ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {showRouteOverrides && (
                          <div className="mt-3 grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 sm:grid-cols-2 lg:grid-cols-3">
                            {routesList.map((route) => (
                              <div key={route.id} className="space-y-1">
                                <div className="text-[11px] font-bold text-slate-700">{route.name}</div>
                                <EmailTagInput
                                  value={routeEmailsMap[String(route.id)] || ''}
                                  onChange={(val) => updateRouteEmail(String(route.id), val)}
                                  placeholder={`Override for ${route.name}...`}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: SHIFT WINDOWS & GLOBAL DELIVERY SETTINGS */}
        {workspaceView === 'automation' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Shift Windows &amp; Global Delivery Settings</h3>
                <p className="text-xs text-slate-500">
                  Define shift cutoffs, daily digest dispatch time, and fallback supervisor recipients.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {shifts.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShifts(PRESET);
                      setDirty(true);
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
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
                  className="inline-flex items-center gap-1 rounded-xl bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Shift
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Daily Consolidated Dispatch Time</label>
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

            {shifts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                No shifts configured yet. Click &ldquo;Load 3-Shift Preset&rdquo; or &ldquo;Add Shift&rdquo;.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                {shifts.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <input
                      value={s.name}
                      onChange={(e) => updateShift(i, { name: e.target.value })}
                      placeholder="Shift name"
                      className="min-w-[7rem] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold outline-none focus:border-brand-500"
                    />
                    <input
                      type="time"
                      value={s.start}
                      onChange={(e) => updateShift(i, { start: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    />
                    <span className="text-xs text-slate-400">–</span>
                    <input
                      type="time"
                      value={s.end}
                      onChange={(e) => updateShift(i, { end: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShifts((p) => p.filter((_, idx) => idx !== i));
                        setDirty(true);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t border-slate-100 pt-4">
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
                Also copy each guard&apos;s assigned supervisor on shift &amp; route-completion reports
              </label>
              <div>
                <div className="mb-1 text-xs font-bold text-slate-600">Fallback Recipient Email(s)</div>
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
          </section>
        )}

        {/* VIEW 3: PAGINATED DELIVERY HISTORY TABLE */}
        {workspaceView === 'logs' && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
              <div className="flex items-center gap-1.5">
                {(['ALL', 'SENT', 'FAILED'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setLogStatusFilter(st);
                      setLogPage(1);
                    }}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      logStatusFilter === st
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {st === 'ALL' ? 'All Dispatches' : st === 'SENT' ? 'Sent' : 'Failed'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={loadLog}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh Log
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 pl-5 pr-3">Report / Guard</th>
                    <th className="w-[150px] px-3 py-3.5">Shift / Type</th>
                    <th className="w-[130px] px-3 py-3.5">Report Date</th>
                    <th className="px-3 py-3.5">Recipients / Delivery Note</th>
                    <th className="w-[115px] py-3.5 pl-3 pr-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedLog.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                        No dispatch log entries match this filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedLog.map((r, i) => (
                      <tr key={i} className="transition-colors hover:bg-slate-50/90">
                        <td className="py-3.5 pl-5 pr-3 font-bold text-slate-900">
                          {r.guard_name && r.guard_name !== 'Unknown' ? r.guard_name : r.shift_name}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-slate-600">{r.shift_name}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-slate-600">
                          {r.report_date}
                        </td>
                        <td className="max-w-md truncate px-3 py-3.5 text-slate-500">
                          {r.error ? <span className="text-rose-600 font-semibold">{r.error}</span> : r.recipients || '—'}
                        </td>
                        <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              STATUS[r.status] || STATUS.PENDING
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Numbered Pagination Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span>
                  Showing <strong className="font-mono text-slate-900">{logStartItem}</strong>–
                  <strong className="font-mono text-slate-900">{logEndItem}</strong> of{' '}
                  <strong className="font-mono text-slate-900">{totalLogRecords}</strong> dispatches
                </span>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Per page:</span>
                  <select
                    value={logPageSize}
                    onChange={(e) => {
                      setLogPageSize(Number(e.target.value));
                      setLogPage(1);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value={20}>20</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safeLogPage <= 1}
                  onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>

                {logPageNumbers.map((pNum, idx) =>
                  pNum === 'ellipsis' ? (
                    <span key={`el-${idx}`} className="px-2 text-slate-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={pNum}
                      type="button"
                      onClick={() => setLogPage(pNum)}
                      className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold transition ${
                        safeLogPage === pNum
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {pNum}
                    </button>
                  )
                )}

                <button
                  type="button"
                  disabled={safeLogPage >= totalLogPages}
                  onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clean Email & GPS Map Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setPreview(null)} />
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Report Email &amp; Map Preview</div>
                <div className="truncate text-sm font-bold text-slate-900">{preview.subject}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe title="Report preview" srcDoc={preview.html} sandbox="" className="h-[75vh] w-full bg-slate-50" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyReportsPage;
