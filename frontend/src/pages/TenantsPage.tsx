import CategoryManagementPanel from '../components/CategoryManagementPanel';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Plus, Save, Ban, CheckCircle2, UserPlus, Loader2,
  UploadCloud, Trash2, RefreshCw, AlertCircle, MapPin,
  Search, Layers, ShieldCheck, X
} from 'lucide-react';

import { API_V1 as API } from '../lib/api';
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB
const VALID_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];

interface Leaf { path: string; label: string }
interface ModuleDef { path: string; label: string; children: Leaf[] }

const CATALOG: ModuleDef[] = [
  {
    path: 'module_patrol', label: 'Patrol & Checkpoints',
    children: [
      { path: 'module_patrol.allow_route_assignment', label: 'Route assignment to guards' },
      { path: 'module_patrol.allow_live_gps_trail', label: 'Live GPS trail' },
      { path: 'module_patrol.allow_geofence_audit', label: 'Geofence audit' },
      { path: 'module_patrol.allow_guest_enrollment', label: 'Field app: no-login guest enrolment' },
      { path: 'module_patrol.allow_daily_reports', label: 'Daily shift reports by email' },
      { path: 'module_patrol.allow_plant_management', label: 'Manage plants & sites' },
    ],
  },
  {
    path: 'module_incidents', label: 'Incident Command',
    children: [
      { path: 'module_incidents.allow_web_ticket_queue', label: 'Web ticket queue' },
      { path: 'module_incidents.allow_mobile_incident_creation', label: 'Mobile incident creation' },
      { path: 'module_incidents.allowed_creation_options.option_1_severity', label: 'Form field: Severity' },
      { path: 'module_incidents.allowed_creation_options.option_2_category', label: 'Form field: Category' },
      { path: 'module_incidents.allowed_creation_options.option_4_title', label: 'Form field: Title' },
      { path: 'module_incidents.allowed_creation_options.option_5_description', label: 'Form field: Description' },
      { path: 'module_incidents.allowed_creation_options.option_6_camera_photo', label: 'Form field: Camera photo' },
    ],
  },
  {
    path: 'module_integrations', label: 'Integrations',
    children: [
      { path: 'module_integrations.channels.gmail_oauth', label: 'Gmail alerts' },
      { path: 'module_integrations.channels.smtp_email', label: 'Office 365 / SMTP email' },
      { path: 'module_integrations.channels.whatsapp_api', label: 'WhatsApp alerts' },
      { path: 'module_integrations.channels.telegram_bot', label: 'Telegram bot' },
    ],
  },
  { path: 'module_qr_generator', label: 'QR Generator', children: [{ path: 'module_qr_generator.allow_pdf_export', label: 'PDF export' }] },
  { path: 'module_activity_logs', label: 'Activity Log', children: [] },
  { path: 'module_sync_queue', label: 'Sync Queue', children: [] },
];

const getPath = (obj: any, path: string): boolean => {
  let cur = obj;
  for (const k of path.split('.')) cur = cur?.[k];
  return cur === true;
};
const setPath = (obj: any, path: string, value: boolean) => {
  const next = JSON.parse(JSON.stringify(obj || {}));
  const keys = path.split('.');
  let cur = next;
  keys.slice(0, -1).forEach((k) => (cur = cur[k] = cur[k] || {}));
  cur[keys[keys.length - 1]] = value;
  return next;
};
const isOn = (features: any, modulePath: string) => getPath(features, `${modulePath}.enabled`);

interface Tenant {
  id: string;
  name: string;
  code?: string;
  status: string;
  features: any;
  guest_join_code?: string | null;
  logo_url?: string | null;
  address?: string | null;
}

const TenantsPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [joinCode, setJoinCode] = useState('');
  const [address, setAddress] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null | undefined>(undefined);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [newName, setNewName] = useState('');
  const [admin, setAdmin] = useState({ full_name: '', employee_code: '', password: '' });
  const [keyWarning, setKeyWarning] = useState('');
  const [pwLeft, setPwLeft] = useState<number | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [resigning, setResigning] = useState(false);

  const selected = useMemo(() => tenants.find((t) => t.id === selectedId) || null, [tenants, selectedId]);
  const dirty = selected
    ? JSON.stringify(selected.features || {}) !== JSON.stringify(draft) ||
      (selected.guest_join_code || '') !== joinCode.trim() ||
      (selected.address || '') !== address.trim() ||
      logoBase64 !== undefined
    : false;

  const syncHeaderPreview = (t: Tenant | null) => {
    if (!t) return;
    localStorage.setItem(
      'active_tenant_branding',
      JSON.stringify({ id: t.id, name: t.name, logo_url: t.logo_url || null, address: t.address || null })
    );
    window.dispatchEvent(new Event('rakshak-brand-updated'));
  };

  const load = async (keep?: string | null) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/super-admin/tenants`);
      const d = await r.json();
      const list: Tenant[] = d.tenants || [];
      setTenants(list);
      const pick = list.find((t) => t.id === (keep ?? selectedId)) || list[0] || null;
      setSelectedId(pick?.id || null);
      setDraft(pick?.features || {});
      setJoinCode(pick?.guest_join_code || '');
      setAddress(pick?.address || '');
      setLogoPreview(pick?.logo_url || null);
      setLogoBase64(undefined);
      syncHeaderPreview(pick);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    fetch(`${API}/super-admin/diagnostics`)
      .then((r) => r.json())
      .then((d) => { if (d && d.bypasses_rls === false) setKeyWarning(d.message); })
      .catch(() => {});
    fetch(`${API}/super-admin/keepalive`)
      .then((r) => r.json())
      .then((d) => { if (d?.success && d.status) setKeepalive(d.status); })
      .catch(() => {});
    fetch(`${API}/super-admin/password-hashing`)
      .then((r) => r.json())
      .then((d) => setPwLeft(typeof d.plaintext_remaining === 'number' ? d.plaintext_remaining : null))
      .catch(() => {});
  }, []);

  const handleLogoFile = (file: File) => {
    setLogoError(null);
    if (!VALID_LOGO_TYPES.includes(file.type)) {
      setLogoError('Unsupported format. Upload PNG, JPG, or SVG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`File is ${(file.size / 1048576).toFixed(2)} MB. Max allowed size is 5 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setLogoPreview(b64);
      setLogoBase64(b64);
    };
    reader.readAsDataURL(file);
  };

  const resignCheckpoints = async () => {
    if (!confirm('Re-sign ALL checkpoints? Every QR code printed so far becomes invalid and must be re-printed.')) return;
    setResigning(true);
    try {
      const r = await fetch(`${API}/super-admin/resign-checkpoints`, { method: 'POST' });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      flash(`Re-signed ${d.resigned} checkpoint(s). Re-print the QR codes from the QR Generator page.`);
    } catch (e: any) {
      flash(e.message || 'Re-sign failed');
    } finally {
      setResigning(false);
    }
  };

  const runKeepalivePing = async () => {
    setPingingDb(true);
    try {
      const r = await fetch(`${API}/super-admin/keepalive`, { method: 'POST' });
      const d = await r.json();
      if (d.success && d.status) {
        setKeepalive(d.status);
        flash(`Database keepalive ping succeeded (${d.status.latency_ms} ms).`);
      } else {
        flash(d.message || 'Keepalive ping failed.');
      }
    } finally {
      setPingingDb(false);
    }
  };

  const securePasswords = async () => {
    setPwBusy(true);
    try {
      let left = pwLeft ?? 1;
      for (let i = 0; i < 200 && left > 0; i++) {
        const r = await fetch(`${API}/super-admin/password-hashing`, { method: 'POST' });
        const d = await r.json();
        if (!d.success) throw new Error(d.message);
        left = d.plaintext_remaining;
        setPwLeft(left);
        if (d.hashed === 0) break;
      }
      flash(left === 0 ? 'All passwords are now securely hashed.' : `${left} password(s) still need hashing. Run again.`);
    } catch (e: any) {
      flash(e.message || 'Could not secure passwords');
    } finally {
      setPwBusy(false);
    }
  };

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  const select = (t: Tenant) => {
    setSelectedId(t.id);
    setDraft(t.features || {});
    setJoinCode(t.guest_join_code || '');
    setAddress(t.address || '');
    setLogoPreview(t.logo_url || null);
    setLogoBase64(undefined);
    setLogoError(null);
    syncHeaderPreview(t);
  };

  const makeCode = () => setJoinCode(Array.from(crypto.getRandomValues(new Uint8Array(8))).map((n) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[n % 31]).join(''));

  const toggle = (path: string, isModule: boolean) => {
    let next = setPath(draft, path, !getPath(draft, path));
    if (isModule && !getPath(next, path)) {
      const mod = CATALOG.find((m) => `${m.path}.enabled` === path);
      mod?.children.forEach((c) => (next = setPath(next, c.path, false)));
    }
    setDraft(next);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        features: draft,
        guest_join_code: joinCode.trim(),
        address: address.trim() || null,
      };
      if (logoBase64 !== undefined) {
        payload.logo_base64 = logoBase64;
      }
      const r = await fetch(`${API}/super-admin/tenants/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      flash('Industry branding & entitlements saved.');
      await load(selected.id);
    } catch (e: any) {
      flash(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: 'ACTIVE' | 'SUSPENDED') => {
    if (!selected) return;
    if (status === 'SUSPENDED' && !confirm(`Suspend ${selected.name}? All of its users are locked out immediately.`)) return;
    const r = await fetch(`${API}/super-admin/tenants/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    const d = await r.json();
    flash(d.success ? `Organization ${status.toLowerCase()}.` : d.message);
    load(selected.id);
  };

  const createTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const r = await fetch(`${API}/super-admin/tenants`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), features: {} }),
    });
    const d = await r.json();
    if (!d.success) return flash(d.message);
    setNewName('');
    flash('Industry created. Upload its branding logo and enable purchased modules below.');
    load(d.tenant.id);
  };

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const r = await fetch(`${API}/super-admin/tenants/${selected.id}/admins`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(admin),
    });
    const d = await r.json();
    if (d.success) { setAdmin({ full_name: '', employee_code: '', password: '' }); flash(`Industry Admin ${d.admin.employee_code} created.`); }
    else flash(d.message);
  };

  const [tenantWorkspace, setTenantWorkspace] = useState<'all' | 'modules' | 'branding' | 'security'>('all');
  const [tenantStatusFilter, setTenantStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [keepalive, setKeepalive] = useState<{ last_ping_at?: string; trigger?: string; latency_ms?: number; schedule?: string } | null>(null);
  const [pingingDb, setPingingDb] = useState<boolean>(false);

  if (loading) return <div className="p-10 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;

  const activeTenantsCount = tenants.filter((t) => t.status === 'ACTIVE').length;
  const suspendedTenantsCount = tenants.filter((t) => t.status !== 'ACTIVE').length;
  const enabledModulesCount = CATALOG.filter((m) => isOn(draft, m.path)).length;

  const filteredTenants = tenants.filter((t) => {
    if (tenantStatusFilter === 'ACTIVE' && t.status !== 'ACTIVE') return false;
    if (tenantStatusFilter === 'SUSPENDED' && t.status === 'ACTIVE') return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 font-sans text-xs text-slate-800">
      <div className="mx-auto max-w-[1600px] space-y-5">
        {/* Tactical Calm Header with Tenant Selector, Section Filter & New Industry Action */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Industries, Branding &amp; Entitlements
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Manage plant tenants, custom logos, module licences, and Industry Admin credentials.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {filteredTenants.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Building2 className="h-3.5 w-3.5 text-brand-600" />
                <span className="text-[11px] font-bold uppercase text-slate-400">
                  {tenantStatusFilter === 'ALL' ? 'Tenant:' : `${tenantStatusFilter}:`}
                </span>
                <select
                  value={selectedId || ''}
                  onChange={(e) => {
                    const found = tenants.find((t) => t.id === e.target.value);
                    if (found) select(found);
                  }}
                  className="max-w-[220px] truncate bg-transparent text-xs font-extrabold text-slate-900 outline-none"
                >
                  {filteredTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.status !== 'ACTIVE' ? '(Suspended)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Layers className="h-3.5 w-3.5 text-brand-600" />
              <span className="text-[11px] font-bold uppercase text-slate-400">Section:</span>
              <select
                value={tenantWorkspace}
                onChange={(e) => setTenantWorkspace(e.target.value as any)}
                className="bg-transparent text-xs font-extrabold text-slate-900 outline-none"
              >
                <option value="all">All Settings</option>
                <option value="modules">Module &amp; Feature Licences ({enabledModulesCount}/{CATALOG.length})</option>
                <option value="branding">Branding &amp; Site Address</option>
                <option value="security">Admins &amp; QR Key Rotation</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-xs transition hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5 text-brand-600" />
              New Industry
            </button>

            {selected && (
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5 text-emerald-400" />
                {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
              </button>
            )}
          </div>
        </div>

        {/* 4-Card Summary KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setTenantStatusFilter('ALL')}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              tenantStatusFilter === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold uppercase ${tenantStatusFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Industries
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold">{tenants.length}</div>
            </div>
            <Building2 className={`h-5 w-5 ${tenantStatusFilter === 'ALL' ? 'text-sky-400' : 'text-slate-400'}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setTenantStatusFilter('ACTIVE');
              const firstActive = tenants.find((t) => t.status === 'ACTIVE');
              if (firstActive && selected?.status !== 'ACTIVE') select(firstActive);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              tenantStatusFilter === 'ACTIVE'
                ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-emerald-700">Active Tenants</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{activeTenantsCount}</div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </button>

          <button
            type="button"
            onClick={() => {
              setTenantStatusFilter('SUSPENDED');
              const firstSusp = tenants.find((t) => t.status !== 'ACTIVE');
              if (firstSusp && selected?.status === 'ACTIVE') select(firstSusp);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              tenantStatusFilter === 'SUSPENDED'
                ? 'border-rose-500 bg-rose-50/70 ring-2 ring-rose-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-rose-700">Suspended</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{suspendedTenantsCount}</div>
            </div>
            <Ban className="h-5 w-5 text-rose-600" />
          </button>

          <button
            type="button"
            onClick={() => setTenantWorkspace('modules')}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              tenantWorkspace === 'modules'
                ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-indigo-700">Licensed Modules</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">
                {enabledModulesCount} <span className="text-xs font-semibold text-slate-400">/ {CATALOG.length}</span>
              </div>
            </div>
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
          </button>
        </div>

        {/* Super Admin Only: Automated Every-2-Days Supabase Keepalive Heartbeat */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <div>
              <span className="text-xs font-extrabold text-slate-900">Database Keepalive Cron</span>
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                Every 2 Days (06:00 UTC)
              </span>
              <div className="text-[11px] text-slate-500">
                {keepalive?.last_ping_at
                  ? `Last heartbeat: ${new Date(keepalive.last_ping_at).toLocaleString()} (${keepalive.trigger} · ${keepalive.latency_ms} ms)`
                  : 'Scheduled automatically every 48 hours to keep Supabase active.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={runKeepalivePing}
            disabled={pingingDb}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-600 ${pingingDb ? 'animate-spin' : ''}`} />
            {pingingDb ? 'Pinging…' : 'Ping Now'}
          </button>
        </div>

        {keyWarning && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-rose-800">
            Security warning: {keyWarning}
          </div>
        )}

        {pwLeft !== null && pwLeft > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
            <span><strong>{pwLeft}</strong> account(s) still store a plain-text password.</span>
            <button
              type="button"
              onClick={securePasswords}
              disabled={pwBusy}
              className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {pwBusy ? 'Securing…' : 'Secure passwords now'}
            </button>
          </div>
        )}

        {msg && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3.5 text-xs font-bold text-blue-800">
            {msg}
          </div>
        )}

        {/* Full-Width Entitlements & Branding Workspace (No Left Sidebar) */}
        {selected ? (
          <section className="space-y-5">
            {/* Selected Tenant Action Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                  {logoPreview ? (
                    <img src={logoPreview} alt={selected.name} className="h-full w-full object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-brand-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-slate-900">{selected.name}</span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                        selected.status === 'ACTIVE'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                      }`}
                    >
                      {selected.status}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">{selected.id}</div>
                </div>
              </div>
              <div className="flex gap-2">
                {selected.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    onClick={() => setStatus('SUSPENDED')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    <Ban className="h-3.5 w-3.5" /> Suspend Tenant
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus('ACTIVE')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate Tenant
                  </button>
                )}
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-40"
                >
                  <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* SECTION 1: INDUSTRY LOGO UPLOAD & ADDRESS CARD */}
            {(tenantWorkspace === 'all' || tenantWorkspace === 'branding') && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="text-sm font-extrabold text-slate-900">Industry Branding &amp; Site Address</div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLogoFile(f);
                    e.target.value = '';
                  }}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Industry Logo (PNG, JPG, SVG · Max 5MB)
                    </label>
                    {logoPreview ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5">
                            <img src={logoPreview} alt="Preview" className="max-h-12 w-auto object-contain" />
                          </div>
                          <div className="text-xs">
                            <div className="font-bold text-emerald-700">Active Logo</div>
                            <div className="text-[11px] text-slate-500">Shown on Header, PDF &amp; QR Sheets</div>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => { setLogoPreview(null); setLogoBase64(null); }}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          const f = e.dataTransfer.files?.[0];
                          if (f) handleLogoFile(f);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition ${
                          dragging ? 'border-brand-600 bg-brand-50/50' : 'border-slate-300 bg-slate-50/50 hover:border-brand-500'
                        }`}
                      >
                        <UploadCloud className="mx-auto mb-1 h-7 w-7 text-brand-600" />
                        <div className="text-xs font-bold text-slate-800">
                          Drag &amp; drop logo here, or <span className="text-brand-600 underline">browse</span>
                        </div>
                        <div className="text-[11px] text-slate-400">PNG, JPG, SVG up to 5MB</div>
                      </div>
                    )}
                    {logoError && (
                      <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600">
                        <AlertCircle className="h-3.5 w-3.5" /> {logoError}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Facility / Plant Address
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <textarea
                        rows={3}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g., Plot 14, Sector 4, Industrial Estate"
                        className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: MODULE ENTITLEMENTS GRID (Full-Width 3 Columns) */}
            {(tenantWorkspace === 'all' || tenantWorkspace === 'modules') && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {CATALOG.map((m) => {
                  const on = isOn(draft, m.path);
                  return (
                    <div key={m.path} className={`rounded-2xl border p-4 shadow-xs transition ${on ? 'border-blue-200 bg-white' : 'border-slate-200 bg-slate-50/80'}`}>
                      <label className="flex cursor-pointer items-center justify-between">
                        <span className="text-sm font-extrabold text-slate-900">{m.label}</span>
                        <input type="checkbox" checked={on} onChange={() => toggle(`${m.path}.enabled`, true)} className="h-4 w-4 accent-brand-600" />
                      </label>
                      {on && m.path === 'module_patrol' && getPath(draft, 'module_patrol.allow_guest_enrollment') && (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                          <label className="text-xs font-bold text-emerald-900">Site code for the Field app (6–12 chars)</label>
                          <div className="mt-1 flex gap-2">
                            <input
                              value={joinCode}
                              onChange={(e) => setJoinCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12))}
                              placeholder="e.g. K7QM42XA"
                              className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-xs uppercase outline-none focus:border-emerald-500"
                            />
                            <button type="button" onClick={makeCode} className="rounded-lg border border-emerald-300 px-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
                              Generate
                            </button>
                          </div>
                          <p className="mt-1 text-[11px] text-emerald-800">Guards need this code to join this industry.</p>
                        </div>
                      )}
                      {on && m.children.length > 0 && (
                        <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                          {m.children.map((c) => (
                            <li key={c.path}>
                              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                                <input type="checkbox" checked={getPath(draft, c.path)} onChange={() => toggle(c.path, false)} className="h-3.5 w-3.5 accent-brand-600" />
                                {c.label}
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* SECTION 2B: SUPER ADMIN INCIDENT CATEGORY ALLOWANCE & MANAGEMENT */}
            {(tenantWorkspace === 'all' || tenantWorkspace === 'modules') && (
              <CategoryManagementPanel tenantId={selected.id} tenantName={selected.name} />
            )}

            {/* SECTION 3: ADMIN ACCOUNT CREATION & QR KEY ROTATION */}
            {(tenantWorkspace === 'all' || tenantWorkspace === 'security') && (
              <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="text-sm font-extrabold text-slate-900">QR Code Security</div>
                  <p className="mt-1 text-xs text-slate-500">
                    After rotating <code className="font-mono text-slate-700">QR_SECRET</code> on the server, re-sign all checkpoints so older QR codes stop working.
                  </p>
                  <button
                    type="button"
                    onClick={resignCheckpoints}
                    disabled={resigning}
                    className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {resigning ? 'Re-signing…' : 'Re-sign All QR Codes'}
                  </button>
                </div>

                <form onSubmit={createAdmin} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-900">
                    <UserPlus className="h-4 w-4 text-brand-600" />
                    Create Industry Admin (CSO / Plant Head)
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <input
                      required
                      placeholder="Full name"
                      value={admin.full_name}
                      onChange={(e) => setAdmin({ ...admin, full_name: e.target.value })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                    />
                    <input
                      required
                      placeholder="Employee code (login)"
                      value={admin.employee_code}
                      onChange={(e) => setAdmin({ ...admin, employee_code: e.target.value })}
                      className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-brand-500"
                    />
                    <input
                      required
                      type="password"
                      minLength={8}
                      placeholder="Password (8+ chars)"
                      value={admin.password}
                      onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="mt-3.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                  >
                    Create Industry Admin
                  </button>
                </form>
              </div>
            )}
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
            No industry selected. Click <strong>+ New Industry</strong> in the top bar to create one.
          </div>
        )}
      </div>

      {/* CREATE NEW INDUSTRY MODAL */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand-600" />
                <h3 className="text-base font-extrabold text-slate-900">Create New Industry</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                await createTenant(e);
                setShowCreateModal(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Industry / Plant Name *
                </label>
                <input
                  required
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Chemical Manufacturing Unit - Site A"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5 text-emerald-400" />
                  Create Industry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantsPage;
