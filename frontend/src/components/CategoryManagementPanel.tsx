import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Check, X, Power, Tags, RefreshCw } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'https://rakshak-api.spandangrasim.workers.dev/api/v1';
type Category = { id: string; name: string; is_active: boolean; created_at?: string };

export default function CategoryManagementPanel() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` });
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/incident-categories?include_inactive=true`, { headers: headers() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to load categories');
      setItems(data.categories || []);
    } catch (e: any) { setError(e.message || 'Unable to load categories'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const add = async () => {
    if (!name.trim()) return; setSaving(true); setError('');
    try { const res = await fetch(`${API}/incident-categories`, { method: 'POST', headers: headers(), body: JSON.stringify({ name: name.trim() }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.message || 'Unable to add category'); setName(''); await load(); }
    catch (e: any) { setError(e.message || 'Unable to add category'); } finally { setSaving(false); }
  };
  const update = async (id: string, patch: Partial<Category>) => {
    setSaving(true); setError('');
    try { const res = await fetch(`${API}/incident-categories/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.message || 'Unable to update category'); setEditing(null); await load(); }
    catch (e: any) { setError(e.message || 'Unable to update category'); } finally { setSaving(false); }
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2.5"><Tags className="h-5 w-5 text-indigo-600"/><div><h2 className="text-sm font-extrabold text-slate-900">Incident Category Management</h2><p className="text-xs text-slate-500">Manage the categories available when reporting new incidents. Historical incidents are preserved.</p></div></div>
      <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw className="h-3.5 w-3.5"/>Refresh</button>
    </div>
    <div className="flex flex-wrap gap-2"><input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Enter a new category name" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-indigo-500"/><button type="button" onClick={() => void add()} disabled={saving || !name.trim()} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5"/>Add Category</button></div>
    {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-3">Category Name</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Created Date</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={4} className="p-4 text-center text-slate-500">Loading categories…</td></tr> : items.length === 0 ? <tr><td colSpan={4} className="p-4 text-center text-slate-500">No categories found. Add the first category above.</td></tr> : items.map(item => <tr key={item.id}><td className="px-3 py-3">{editing === item.id ? <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} maxLength={80} className="w-full rounded-lg border border-indigo-300 px-2 py-1"/> : <span className="font-bold text-slate-800">{item.name}</span>}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td><td className="px-3 py-3 text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td><td className="px-3 py-3"><div className="flex justify-end gap-2">{editing === item.id ? <><button type="button" disabled={saving || !editName.trim()} onClick={() => void update(item.id, { name: editName.trim() })} className="text-emerald-700"><Check className="h-4 w-4"/></button><button type="button" onClick={() => setEditing(null)} className="text-slate-500"><X className="h-4 w-4"/></button></> : <><button type="button" onClick={() => { setEditing(item.id); setEditName(item.name); }} className="inline-flex items-center gap-1 text-indigo-700"><Pencil className="h-3.5 w-3.5"/>Edit</button><button type="button" disabled={saving} onClick={() => void update(item.id, { is_active: !item.is_active })} className={`inline-flex items-center gap-1 ${item.is_active ? 'text-rose-600' : 'text-emerald-700'}`}><Power className="h-3.5 w-3.5"/>{item.is_active ? 'Deactivate' : 'Activate'}</button></>}</div></td></tr>)}</tbody></table></div>
  </section>;
}
