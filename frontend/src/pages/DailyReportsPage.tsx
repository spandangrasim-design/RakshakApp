import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Plus, Trash2, Eye, Send, Save, X, Clock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

const API = `${(import.meta as any).env?.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev'}/api/v1`;

interface Shift { name: string; start: string; end: string }
interface LogRow { guard_name: string; shift_name: string; report_date: string; status: string; recipients: string | null; error: string | null; sent_at: string | null; created_at: string }

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

const post = (path: string, body: any) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

export const DailyReportsPage: React.FC = () => {
  const modules = (() => { try { return JSON.parse(localStorage.getItem('visible_modules') || '{}'); } catch { return {}; } })();
  const gmailOn = modules.integration_gmail === true;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'' | 'preview' | 'send'>('');
  const [enabled, setEnabled] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [delay, setDelay] = useState('15');
  const [emails, setEmails] = useState('');
  const [toSupervisor, setToSupervisor] = useState(true);
  const [log, setLog] = useState<LogRow[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const mark = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const loadLog = useCallback(() => {
    fetch(`${API}/daily-reports/log`).then((r) => r.json()).then((d) => setLog(d.log || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/admin/configs`)
      .then((r) => r.json())
      .then((d) => {
        const cfg: Record<string, string> = {};
        for (const row of d.configs || []) cfg[row.key_name] = row.key_value;
        setEnabled(cfg.DAILY_REPORT_ENABLED === 'true');
        try { setShifts(JSON.parse(cfg.DAILY_REPORT_SHIFTS || '[]')); } catch { setShifts([]); }
        setDelay(cfg.DAILY_REPORT_DELAY_MIN || '15');
        setEmails(cfg.DAILY_REPORT_EMAILS || '');
        setToSupervisor(cfg.DAILY_REPORT_TO_SUPERVISOR !== 'false');
      })
      .catch(() => alert('Could not load the report settings.'))
      .finally(() => setLoading(false));
    loadLog();
  }, [loadLog]);

  const updateShift = (i: number, patch: Partial<Shift>) => { setShifts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s))); setDirty(true); };

  const save = async () => {
    const clean = shifts.filter((s) => s.name.trim() && s.start && s.end).map((s) => ({ name: s.name.trim(), start: s.start, end: s.end }));
    if (enabled && clean.length === 0) return alert('Add at least one shift, or switch daily reports off.');
    if (enabled && !toSupervisor && !emails.trim()) return alert('Enter at least one email address, or send to each guard’s supervisor.');
    setSaving(true);
    try {
      const d = await post('/admin/configs', [
        { key_name: 'DAILY_REPORT_ENABLED', key_value: enabled ? 'true' : 'false' },
        { key_name: 'DAILY_REPORT_SHIFTS', key_value: JSON.stringify(clean) },
        { key_name: 'DAILY_REPORT_DELAY_MIN', key_value: String(Math.max(0, Math.min(180, Number(delay) || 15))) },
        { key_name: 'DAILY_REPORT_EMAILS', key_value: emails.trim() },
        { key_name: 'DAILY_REPORT_TO_SUPERVISOR', key_value: toSupervisor ? 'true' : 'false' },
      ]);
      if (!d.success) throw new Error(d.message);
      setShifts(clean);
      setDirty(false);
      alert('Report settings saved.');
    } catch (e: any) {
      alert(e.message || 'Could not save the settings.');
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    setBusy('preview');
    try {
      const d = await post('/daily-reports/send-now', { preview: true });
      if (!d.success) throw new Error(d.message);
      if (d.empty) return alert(d.message || 'No guard has any activity today yet.');
      setPreview({ subject: d.subject, html: d.html });
    } catch (e: any) {
      alert(e.message || 'Could not build the preview.');
    } finally { setBusy(''); }
  };

  const sendTest = async () => {
    if (dirty) return alert('Save your settings first, then send a test.');
    setBusy('send');
    try {
      const d = await post('/daily-reports/send-now', {});
      if (!d.success) throw new Error(d.message);
      if (d.empty) return alert(d.message || 'No guard has any activity today yet.');
      if (d.failed > 0) alert(`Sent ${d.sent}, failed ${d.failed}. ${(d.errors || []).join(' ')}`);
      else if (d.sent === 0) alert('Nothing was sent: no recipient email is set for these guards.');
      else alert(`Sent ${d.sent} report${d.sent === 1 ? '' : 's'} (today so far).`);
    } catch (e: any) {
      alert(e.message || 'Could not send the test.');
    } finally { setBusy(''); }
  };

  if (loading) {
    return <div className="mx-auto max-w-4xl space-y-4 p-6">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32" />)}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="animate-slide-up">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Daily shift reports</h2>
        <p className="text-sm text-slate-500">After each shift ends, every guard who worked it gets one report emailed to their supervisor.</p>
      </div>

      {!gmailOn && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>Email reports need <strong>Gmail alerts</strong> to be enabled for your industry and connected under Integrations.</span>
        </div>
      )}

      {/* On / off */}
      <section className="card animate-slide-up p-5" style={{ animationDelay: '60ms' }}>
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-base font-extrabold text-slate-900">Send daily reports</span>
            <span className="block text-xs text-slate-500">Turn this off to stop all report emails. Nothing is deleted.</span>
          </span>
          <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? 'bg-brand-600' : 'bg-slate-300'}`}>
            <input type="checkbox" className="sr-only" checked={enabled} onChange={(e) => mark(setEnabled)(e.target.checked)} />
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </span>
        </label>
      </section>

      {/* Shifts */}
      <section className={`card animate-slide-up p-5 transition ${enabled ? '' : 'opacity-60'}`} style={{ animationDelay: '120ms' }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Shifts</h3>
            <p className="text-xs text-slate-500">A report is sent after each shift ends. Night shifts can cross midnight (22:00 to 06:00).</p>
          </div>
          <div className="flex gap-2">
            {shifts.length === 0 && (
              <button onClick={() => { setShifts(PRESET); setDirty(true); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-brand-300 hover:text-brand-700">Use 3 standard shifts</button>
            )}
            <button onClick={() => { setShifts((p) => [...p, { name: '', start: '09:00', end: '17:00' }]); setDirty(true); }} className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"><Plus className="h-3.5 w-3.5" /> Add shift</button>
          </div>
        </div>

        {shifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No shifts yet. Add your shifts so Rakshak knows when to send reports.</div>
        ) : (
          <div className="space-y-2">
            {shifts.map((s, i) => (
              <div key={i} className="flex animate-fade-in flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <input value={s.name} onChange={(e) => updateShift(i, { name: e.target.value })} placeholder="Shift name" className="min-w-[8rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500" />
                <Clock className="h-4 w-4 text-slate-400" />
                <input type="time" value={s.start} onChange={(e) => updateShift(i, { start: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500" />
                <span className="text-xs text-slate-400">to</span>
                <input type="time" value={s.end} onChange={(e) => updateShift(i, { end: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500" />
                {s.end <= s.start && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">ends next day</span>}
                <button onClick={() => { setShifts((p) => p.filter((_, idx) => idx !== i)); setDirty(true); }} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove shift"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          Send the report
          <input type="number" min={0} max={180} value={delay} onChange={(e) => mark(setDelay)(e.target.value)} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm outline-none focus:border-brand-500" />
          minutes after the shift ends
        </div>
      </section>

      {/* Recipients */}
      <section className={`card animate-slide-up p-5 transition ${enabled ? '' : 'opacity-60'}`} style={{ animationDelay: '180ms' }}>
        <h3 className="text-base font-extrabold text-slate-900">Who receives it</h3>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={toSupervisor} onChange={(e) => mark(setToSupervisor)(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
          <span><strong>Each guard’s supervisor</strong><span className="block text-xs text-slate-500">Set “Reports to” on the People &amp; access page. The supervisor needs an email address there.</span></span>
        </label>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-bold text-slate-600">Always also send to (optional)</label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-brand-500">
            <Mail className="h-4 w-4 text-slate-400" />
            <input value={emails} onChange={(e) => mark(setEmails)(e.target.value)} placeholder="manager@company.com, security-head@company.com" className="w-full bg-transparent py-2.5 text-sm outline-none" />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Separate several addresses with commas. Used when a guard has no supervisor, too.</p>
        </div>
      </section>

      {/* Actions */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lift backdrop-blur">
        <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-40">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
        </button>
        <button onClick={runPreview} disabled={busy !== ''} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-brand-300 disabled:opacity-50">
          {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview today’s report
        </button>
        <button onClick={sendTest} disabled={busy !== '' || !gmailOn} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-brand-300 disabled:opacity-50">
          {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test now
        </button>
        {dirty && <span className="ml-auto text-xs font-semibold text-amber-600">Unsaved changes</span>}
      </div>

      {/* History */}
      <section className="card animate-slide-up p-5" style={{ animationDelay: '240ms' }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">Recently sent</h3>
          <button onClick={loadLog} className="text-xs font-bold text-brand-600 hover:underline">Refresh</button>
        </div>
        {log.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Reports will show up here after the first shift ends.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {log.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 py-2.5">
                <CheckCircle2 className={`h-4 w-4 ${r.status === 'SENT' ? 'text-emerald-500' : 'text-slate-300'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-900">{r.guard_name} <span className="font-medium text-slate-400">· {r.shift_name} · {r.report_date}</span></div>
                  <div className="truncate text-xs text-slate-400">{r.error ? r.error : r.recipients || '—'}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS[r.status] || STATUS.PENDING}`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm" onClick={() => setPreview(null)} />
          <div className="relative flex max-h-[90vh] w-full max-w-3xl animate-scale-in flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Email preview</div><div className="truncate text-sm font-bold text-slate-900">{preview.subject}</div></div>
              <button onClick={() => setPreview(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <iframe title="Report preview" srcDoc={preview.html} sandbox="" className="h-[70vh] w-full bg-slate-50" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyReportsPage;
