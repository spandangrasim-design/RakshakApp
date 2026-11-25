import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Check, X, Power, Tags, RefreshCw, ShieldCheck } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'https://rakshak-api.spandangrasim.workers.dev/api/v1';
type Category = { id: string; name: string; is_active: boolean; created_at?: string };

interface CategoryManagementPanelProps {
  tenantId: string;
  tenantName?: string;
}

export default function CategoryManagementPanel({ tenantId, tenantName }: CategoryManagementPanelProps) {
  const [items, setItems] = useState<Category[]>([]);
  const [maxAllowed, setMaxAllowed] = useState<number>(10);
  const [limitInput, setLimitInput] = useState<string>('10');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  });

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${API}/incident-categories?tenant_id=${encodeURIComponent(tenantId)}&include_inactive=true`,
        { headers: headers() }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to load categories');
      setItems(data.categories || []);
      const quota = typeof data.max_allowed === 'number' ? data.max_allowed : 10;
      setMaxAllowed(quota);
      setLimitInput(String(quota));
    } catch (e: any) {
      setError(e.message || 'Unable to load categories');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    setEditing(null);
    setNotice('');
    void load();
  }, [load]);

  const saveLimit = async () => {
    if (!tenantId) return;
    setSavingLimit(true);
    setError('');
    setNotice('');
    try {
      const parsed = Math.max(0, Math.min(100, Math.floor(Number(limitInput) || 0)));
      const res = await fetch(
        `${API}/super-admin/tenants/${encodeURIComponent(tenantId)}/incident-categories/limit`,
        {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify({ max_allowed: parsed }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to save category allowance');
      setMaxAllowed(data.max_allowed);
      setLimitInput(String(data.max_allowed));
      setNotice(`Allowed active category limit updated to ${data.max_allowed} for ${tenantName || 'this tenant'}.`);
    } catch (e: any) {
      setError(e.message || 'Unable to save category allowance');
    } finally {
      setSavingLimit(false);
    }
  };

  const add = async () => {
    if (!name.trim() || !tenantId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API}/incident-categories`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ tenant_id: tenantId, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to add category');
      setName('');
      await load();
    } catch (e: any) {
      setError(e.message || 'Unable to add category');
    } finally {
      setSaving(false);
    }
  };

  const update = async (id: string, patch: Partial<Category>) => {
    if (!tenantId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API}/incident-categories/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ tenant_id: tenantId, ...patch }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to update category');
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Unable to update category');
    } finally {
      setSaving(false);
    }
  };

  const activeCount = items.filter((i) => i.is_active).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <Tags className="h-5 w-5 text-indigo-600" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900">
                Incident Category Management {tenantName ? `· ${tenantName}` : ''}
              </h2>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-extrabold text-indigo-800">
                {activeCount} / {maxAllowed} Active Shown
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Control which categories are available and how many active categories are shown to this tenant.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 px-2.5 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
            <span className="text-[11px] font-bold text-indigo-950">Max Shown:</span>
            <input
              type="number"
              min={0}
              max={100}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="w-14 rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-center font-mono text-xs font-extrabold text-slate-900 outline-none"
            />
            <button
              type="button"
              onClick={() => void saveLimit()}
              disabled={savingLimit}
              className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingLimit ? 'Saving…' : 'Apply'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Enter a new category name"
          className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:bg-white"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Category
        </button>
      </div>

      {notice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Category Name</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Created Date</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-500">
                  Loading categories…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-500">
                  No categories found for this tenant. Add the first category above.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3">
                    {editing === item.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={80}
                        className="w-full rounded-lg border border-indigo-300 px-2 py-1"
                      />
                    ) : (
                      <span className="font-bold text-slate-800">{item.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      {editing === item.id ? (
                        <>
                          <button
                            type="button"
                            disabled={saving || !editName.trim()}
                            onClick={() => void update(item.id, { name: editName.trim() })}
                            className="text-emerald-700"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className="text-slate-500">
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(item.id);
                              setEditName(item.name);
                            }}
                            className="inline-flex items-center gap-1 text-indigo-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void update(item.id, { is_active: !item.is_active })}
                            className={`inline-flex items-center gap-1 ${
                              item.is_active ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            <Power className="h-3.5 w-3.5" />
                            {item.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
