import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Save, Ban, CheckCircle2, UserPlus, Loader2 } from 'lucide-react';

const API = `${(import.meta as any).env?.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev'}/api/v1`;

// ---------------------------------------------------------------------------
// The catalog below is what the Super Admin sells. Each leaf is a path into tenants.features.
// Sub-features are only editable while their parent module is on.
// ---------------------------------------------------------------------------
interface Leaf { path: string; label: string }
interface ModuleDef { path: string; label: string; children: Leaf[] }

const CATALOG: ModuleDef[] = [
  {
    path: 'module_patrol', label: 'Patrol & Checkpoints',
    children: [
      { path: 'module_patrol.allow_route_assignment', label: 'Route assignment to guards' },
      { path: 'module_patrol.allow_live_gps_trail', label: 'Live GPS trail' },
      { path: 'module_patrol.allow_geofence_audit', label: 'Geofence audit' },
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

interface Tenant { id: string; name: string; status: string; features: any }

const TenantsPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [newName, setNewName] = useState('');
  const [admin, setAdmin] = useState({ full_name: '', employee_code: '', password: '' });

  const selected = useMemo(() => tenants.find((t) => t.id === selectedId) || null, [tenants, selectedId]);
  const dirty = selected ? JSON.stringify(selected.features || {}) !== JSON.stringify(draft) : false;

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
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  const select = (t: Tenant) => { setSelectedId(t.id); setDraft(t.features || {}); };

  const toggle = (path: string, isModule: boolean) => {
    let next = setPath(draft, path, !getPath(draft, path));
    // Turning a module off turns every sub-feature off with it.
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
      const r = await fetch(`${API}/super-admin/tenants/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: draft }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      flash('Entitlements saved. Users lose revoked features on their next request.');
      await load(selected.id);
    } catch (e: any) { flash(e.message || 'Save failed'); } finally { setSaving(false); }
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
    flash('Industry created with NO features. Enable what they purchased below.');
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
          <h1 className="text-xl font-black text-slate-900">Industries &amp; Entitlements</h1>
          <p className="text-xs text-slate-500">
            What you switch on here is the ceiling. Industry admins can only hand out what is enabled; anything off does not exist in their console or API.
          </p>
        </div>
      </div>

      {msg && <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Tenant list */}
        <aside className="space-y-3">
          <form onSubmit={createTenant} className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New industry name"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <button className="rounded-lg bg-blue-600 px-3 text-white hover:bg-blue-700" title="Create"><Plus className="h-4 w-4" /></button>
          </form>
          <ul className="space-y-1">
            {tenants.map((t) => (
              <li key={t.id}>
                <button onClick={() => select(t)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                    t.id === selectedId ? 'border-blue-300 bg-blue-50 font-bold text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                  <span className="truncate">{t.name}</span>
                  {t.status !== 'ACTIVE' && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Suspended</span>}
                </button>
              </li>
            ))}
            {tenants.length === 0 && <li className="text-xs text-slate-400">No industries yet.</li>}
          </ul>
        </aside>

        {/* Entitlements editor */}
        {selected ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="text-base font-black text-slate-900">{selected.name}</div>
                <div className="font-mono text-[11px] text-slate-400">{selected.id}</div>
              </div>
              <div className="flex gap-2">
                {selected.status === 'ACTIVE'
                  ? <button onClick={() => setStatus('SUSPENDED')} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"><Ban className="h-3.5 w-3.5" />Suspend</button>
                  : <button onClick={() => setStatus('ACTIVE')} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-3.5 w-3.5" />Reactivate</button>}
                <button onClick={save} disabled={!dirty || saving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">
                  <Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save entitlements'}
                </button>
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
