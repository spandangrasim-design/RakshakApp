import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Plus, Save, Ban, CheckCircle2, UserPlus, Loader2,
  UploadCloud, Trash2, RefreshCw, AlertCircle, MapPin,
} from 'lucide-react';

const API = `${(import.meta as any).env?.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev'}/api/v1`;
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
    ],
  },
  {
    path: 'module_incidents', label: 'Incident Command',
    children: [
      { path: 'module_incidents.allow_web_ticket_queue', label: 'Web ticket queue' },
      { path: 'module_incidents.allow_mobile_incident_creation', label: 'Mobile incident creation' },
      { path: 'module_incidents.allowed_creation_options.option_1_severity', label: 'Form field: Severity' },
      { path: 'module_incidents.allowed_creation_options.option_2_category', label: 'Form field: Category' },
      { path: 'module_incidents.allowed_creation_options.option_3_group_routing', label: 'Form field: Group routing' },
      { path: 'module_incidents.allowed_creation_options.option_4_title', label: 'Form field: Title' },
      { path: 'module_incidents.allowed_creation_options.option_5_description', label: 'Form field: Description' },
      { path: 'module_incidents.allowed_creation_options.option_6_camera_photo', label: 'Form field: Camera photo' },
    ],
  },
  {
    path: 'module_integrations', label: 'Integrations',
    children: [
      { path: 'module_integrations.channels.gmail_oauth', label: 'Gmail alerts' },
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

  if (loading) return <div className="p-10 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Building2 className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-black text-slate-900">Industries, Branding &amp; Entitlements</h1>
          <p className="text-xs text-slate-500">
            Configure custom logos and module licences per industry. Logos propagate automatically across headers, reports, mobile apps, and QR A4 PDFs.
          </p>
        </div>
      </div>

      {keyWarning && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          Security warning: {keyWarning}
        </div>
      )}

      {pwLeft !== null && pwLeft > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span><strong>{pwLeft}</strong> account(s) still store a plain-text password.</span>
          <button onClick={securePasswords} disabled={pwBusy}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">
            {pwBusy ? 'Securing…' : 'Secure passwords now'}
          </button>
        </div>
      )}

      {msg && <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Tenant list */}
        <aside className="space-y-3">
          <form onSubmit={createTenant} className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New industry name"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <button className="rounded-lg bg-blue-600 px-3 text-white hover:bg-blue-700" title="Create"><Plus className="h-4 w-4" /></button>
          </form>
          <ul className="space-y-1.5">
            {tenants.map((t) => (
              <li key={t.id}>
                <button onClick={() => select(t)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    t.id === selectedId ? 'border-blue-300 bg-blue-50 font-bold text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
                      {t.logo_url ? (
                        <img src={t.logo_url} alt={t.name} className="h-full w-full object-contain" />
                      ) : (
                        <Building2 className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <span className="truncate">{t.name}</span>
                  </div>
                  {t.status !== 'ACTIVE' && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Suspended</span>}
                </button>
              </li>
            ))}
            {tenants.length === 0 && <li className="text-xs text-slate-400">No industries yet.</li>}
          </ul>
        </aside>

        {/* Entitlements & Branding editor */}
        {selected ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                  {logoPreview ? (
                    <img src={logoPreview} alt={selected.name} className="h-full w-full object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-blue-600" />
                  )}
                </div>
                <div>
                  <div className="text-base font-black text-slate-900">{selected.name}</div>
                  <div className="font-mono text-[11px] text-slate-400">{selected.id}</div>
                </div>
              </div>
              <div className="flex gap-2">
                {selected.status === 'ACTIVE'
                  ? <button onClick={() => setStatus('SUSPENDED')} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"><Ban className="h-3.5 w-3.5" />Suspend</button>
                  : <button onClick={() => setStatus('ACTIVE')} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-3.5 w-3.5" />Reactivate</button>}
                <button onClick={save} disabled={!dirty || saving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">
                  <Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>

            {/* INDUSTRY LOGO UPLOAD & ADDRESS CARD */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="text-sm font-black text-slate-900">Industry Branding &amp; Site Address</div>

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
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
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
                        dragging ? 'border-blue-600 bg-blue-50/50' : 'border-slate-300 bg-slate-50/50 hover:border-blue-500'
                      }`}
                    >
                      <UploadCloud className="mx-auto mb-1 h-7 w-7 text-blue-600" />
                      <div className="text-xs font-bold text-slate-800">
                        Drag &amp; drop logo here, or <span className="text-blue-600 underline">browse</span>
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
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Facility / Plant Address
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <textarea
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Grasim Chemical Division, Plot 14, GIDC Industrial Estate"
                      className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {CATALOG.map((m) => {
                const on = isOn(draft, m.path);
                return (
                  <div key={m.path} className={`rounded-xl border p-4 ${on ? 'border-blue-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
                    <label className="flex cursor-pointer items-center justify-between">
                      <span className="text-sm font-black text-slate-900">{m.label}</span>
                      <input type="checkbox" checked={on} onChange={() => toggle(`${m.path}.enabled`, true)} className="h-4 w-4 accent-blue-600" />
                    </label>
                    {on && m.path === 'module_patrol' && getPath(draft, 'module_patrol.allow_guest_enrollment') && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <label className="text-xs font-bold text-emerald-900">Site code for the Field app (6–12 letters/digits)</label>
                        <div className="mt-1 flex gap-2">
                          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12))}
                            placeholder="e.g. K7QM42XA" className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 font-mono text-sm uppercase outline-none focus:border-emerald-500" />
                          <button type="button" onClick={makeCode} className="rounded-lg border border-emerald-300 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100">Generate</button>
                        </div>
                        <p className="mt-1 text-[11px] text-emerald-800">Guards need this code to join. Without a code, nobody can join this industry.</p>
                      </div>
                    )}
                    {on && m.children.length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-t pt-3">
                        {m.children.map((c) => (
                          <li key={c.path}>
                            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                              <input type="checkbox" checked={getPath(draft, c.path)} onChange={() => toggle(c.path, false)} className="h-3.5 w-3.5 accent-blue-600" />
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

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-black text-slate-900">QR code security</div>
              <p className="mt-1 text-xs text-slate-500">After rotating the QR_SECRET on the server, re-sign all checkpoints so older QR codes stop working.</p>
              <button onClick={resignCheckpoints} disabled={resigning}
                className="mt-3 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                {resigning ? 'Re-signing…' : 'Re-sign all QR codes'}
              </button>
            </div>

            <form onSubmit={createAdmin} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><UserPlus className="h-4 w-4 text-blue-600" />Create Industry Admin (CSO / Plant Head)</div>
              <div className="grid gap-2 sm:grid-cols-3">
                <input required placeholder="Full name" value={admin.full_name} onChange={(e) => setAdmin({ ...admin, full_name: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                <input required placeholder="Employee code (login)" value={admin.employee_code} onChange={(e) => setAdmin({ ...admin, employee_code: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                <input required type="password" minLength={8} placeholder="Password (8+ chars)" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              </div>
              <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700">Create admin</button>
            </form>
          </section>
        ) : (
          <div className="text-sm text-slate-400">Create an industry to begin.</div>
        )}
      </div>
    </div>
  );
};

export default TenantsPage;
