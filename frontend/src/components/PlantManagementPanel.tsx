import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  Power,
  CheckCircle2,
  AlertCircle,
  Users,
  X,
  Save
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

export interface PlantRecord {
  id: string;
  name: string;
  team_name?: string | null;
  assigned_guard_ids?: string[];
  is_active: boolean;
}

export interface PlantGuardOption {
  guard_id: string;
  full_name: string;
  employee_code: string;
  email?: string | null;
  is_active?: boolean;
}

interface Props {
  guards: PlantGuardOption[];
  authHeaders: Record<string, string>;
  onPlantsChanged?: (plants: PlantRecord[]) => void;
}

export const PlantManagementPanel: React.FC<Props> = ({
  guards,
  authHeaders,
  onPlantsChanged,
}) => {
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Add / Edit Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [selectedGuardIds, setSelectedGuardIds] = useState<string[]>([]);

  const activeGuards = guards.filter((g) => g.is_active !== false);

  const loadPlants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/plants`, { headers: authHeaders });
      const data = await res.json();
      if (data.success && Array.isArray(data.plants)) {
        setPlants(data.plants);
        onPlantsChanged?.(data.plants);
      }
    } catch {
      setBanner({ type: 'err', text: 'Failed to load plants.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, onPlantsChanged]);

  useEffect(() => {
    loadPlants();
  }, [loadPlants]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setTeamName('');
    setSelectedGuardIds([]);
  };

  const startEdit = (plant: PlantRecord) => {
    setEditingId(plant.id);
    setName(plant.name);
    setTeamName(plant.team_name || '');
    setSelectedGuardIds(Array.isArray(plant.assigned_guard_ids) ? plant.assigned_guard_ids : []);
    setBanner(null);
  };

  const toggleGuard = (guardId: string) => {
    setSelectedGuardIds((prev) =>
      prev.includes(guardId) ? prev.filter((id) => id !== guardId) : [...prev, guardId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setBanner(null);
    try {
      const url = editingId ? `${API_BASE}/plants/${editingId}` : `${API_BASE}/plants`;
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          name: name.trim(),
          team_name: teamName.trim() || null,
          assigned_guard_ids: selectedGuardIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner({ type: 'err', text: data.message || 'Could not save plant.' });
      } else {
        setBanner({
          type: 'ok',
          text: editingId ? `Updated plant "${name.trim()}".` : `Added plant "${name.trim()}".`,
        });
        resetForm();
        await loadPlants();
      }
    } catch {
      setBanner({ type: 'err', text: 'Network error while saving plant.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plant: PlantRecord) => {
    setBanner(null);
    try {
      const res = await fetch(`${API_BASE}/plants/${plant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ is_active: !plant.is_active }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBanner({
          type: 'ok',
          text: `"${plant.name}" is now ${!plant.is_active ? 'enabled' : 'disabled'}. Historical incidents remain intact.`,
        });
        await loadPlants();
      }
    } catch {
      setBanner({ type: 'err', text: 'Could not update plant status.' });
    }
  };

  const handleDelete = async (plant: PlantRecord) => {
    if (
      !window.confirm(
        `Delete plant "${plant.name}"? Historical incidents will keep their plant name, but new incidents will no longer see this plant.`
      )
    ) {
      return;
    }
    setBanner(null);
    try {
      const res = await fetch(`${API_BASE}/plants/${plant.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (editingId === plant.id) resetForm();
        setBanner({ type: 'ok', text: `Deleted plant "${plant.name}".` });
        await loadPlants();
      }
    } catch {
      setBanner({ type: 'err', text: 'Could not delete plant.' });
    }
  };

  return (
    <div className="space-y-5">
      {banner && (
        <div
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-bold ${
            banner.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {banner.type === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600" />
            )}
            {banner.text}
          </span>
          <button type="button" onClick={() => setBanner(null)} className="rounded p-1 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Add / Edit Plant Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-extrabold text-slate-900">
              {editingId ? `Edit Plant: ${name}` : 'Add New Plant & Routing Team'}
            </h2>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-slate-600">
              Plant Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Test - P1"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-slate-600">
              Mapped Response Team / Group Name
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Security Operations L1 Team"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-600">
            <Users className="h-3.5 w-3.5 text-indigo-600" />
            Assigned Users for Automatic Email Alerts ({selectedGuardIds.length} selected)
          </label>
          <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeGuards.map((g) => {
              const checked = selectedGuardIds.includes(g.guard_id);
              return (
                <label
                  key={g.guard_id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    checked
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-950 font-bold'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleGuard(g.guard_id)}
                    className="h-3.5 w-3.5 accent-indigo-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{g.full_name}</div>
                    <div className="truncate text-[10px] font-normal text-slate-400">
                      {g.email || 'No email configured'}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50"
          >
            {editingId ? <Save className="h-3.5 w-3.5 text-emerald-400" /> : <Plus className="h-3.5 w-3.5 text-emerald-400" />}
            {saving ? 'Saving...' : editingId ? 'Save Plant Changes' : 'Add Plant'}
          </button>
        </div>
      </form>

      {/* Existing Plants Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 pl-5 pr-3">Plant Name</th>
                <th className="px-3 py-3">Mapped Team / Group</th>
                <th className="px-3 py-3">Assigned Users (Email Alerts)</th>
                <th className="w-[110px] px-3 py-3">Status</th>
                <th className="w-[210px] py-3 pl-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    Loading plants...
                  </td>
                </tr>
              ) : plants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    No plants configured yet. Add one above.
                  </td>
                </tr>
              ) : (
                plants.map((plant) => {
                  const ids = Array.isArray(plant.assigned_guard_ids) ? plant.assigned_guard_ids : [];
                  const assignedNames = ids
                    .map((id) => guards.find((g) => g.guard_id === id)?.full_name)
                    .filter(Boolean);

                  return (
                    <tr key={plant.id} className="hover:bg-slate-50/80">
                      <td className="py-3 pl-5 pr-3 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
                          <Building2 className="h-3 w-3" />
                          {plant.name}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">
                        {plant.team_name || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {assignedNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedNames.map((n, i) => (
                              <span
                                key={i}
                                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium"
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-600 font-semibold">No users assigned</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                            plant.is_active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-100 text-slate-500'
                          }`}
                        >
                          {plant.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 pl-3 pr-5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(plant)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                          >
                            <Edit2 className="h-3 w-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(plant)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                            title={plant.is_active ? 'Disable plant' : 'Enable plant'}
                          >
                            <Power className="h-3 w-3" /> {plant.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(plant)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                            title="Delete plant"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PlantManagementPanel;