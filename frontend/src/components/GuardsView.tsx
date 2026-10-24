import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  ShieldCheck, 
  RefreshCw,
  Search,
  Route,
  Clock,
  Building2,
  X
} from 'lucide-react';

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

interface RoundItem {
  id: string;
  name: string;
}

interface Guard {
  guard_id: string;
  full_name: string;
  employee_code: string;
  role?: string;
  site_location?: string;
  shift_timing?: string;
  is_active: boolean;
  created_at: string;
  assigned_round_id?: string | null;
  reporting_to?: string | null;
  rounds?: { id: string; name: string } | null;
}

export const GuardsView: React.FC = () => {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [rounds, setRounds] = useState<RoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [assigningGuard, setAssigningGuard] = useState<Guard | null>(null);
  const [resettingGuard, setResettingGuard] = useState<Guard | null>(null);

  // Form States
  const [newGuard, setNewGuard] = useState({
    full_name: '',
    employee_code: '',
    password: '',
    role: 'Guard',
    site_location: 'Main Plant & Gate 1',
    shift_timing: 'Morning (06:00 - 14:00)',
    assigned_round_id: '',
    reporting_to: '',
  });

  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [guardsRes, roundsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/guards`),
        fetch(`${API_BASE_URL}/rounds`),
      ]);

      const guardsData = await guardsRes.json();
      const roundsData = await roundsRes.json();

      if (guardsData.success) setGuards(guardsData.guards || []);
      if (roundsData.success) setRounds(roundsData.rounds || []);
    } catch (err) {
      console.error('Failed to load guard records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateGuard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuard.full_name || !newGuard.employee_code || !newGuard.password) {
      alert('Please fill all required fields');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/guards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGuard),
      });
      const data = await res.json();
      if (data.success) {
        alert('Personnel registered successfully.');
        setShowAddModal(false);
        setNewGuard({
          full_name: '',
          employee_code: '',
          password: '',
          role: 'Guard',
          site_location: 'Main Plant & Gate 1',
          shift_timing: 'Morning (06:00 - 14:00)',
          assigned_round_id: '',
          reporting_to: '',
        });
        fetchData();
      } else {
        alert(data.message || 'Failed to create guard.');
      }
    } catch (err) {
      alert('Error creating guard.');
    }
  };

  const handleSaveRouteAssignment = async () => {
    if (!assigningGuard) return;
    try {
      const res = await fetch(`${API_BASE_URL}/guards/${assigningGuard.guard_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_round_id: selectedRoundId || null }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Patrol route assigned to ${assigningGuard.full_name}.`);
        setAssigningGuard(null);
        fetchData();
      } else {
        alert(data.message || 'Failed to assign route.');
      }
    } catch (err) {
      alert('Network error while assigning route.');
    }
  };

  const handleToggleStatus = async (guard: Guard) => {
    const action = guard.is_active ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} ${guard.full_name}?`)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/guards/${guard.guard_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !guard.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  const handleResetPassword = async () => {
    if (!resettingGuard || !newPassword.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/guards/${resettingGuard.guard_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Password reset successful for ${resettingGuard.full_name}.`);
        setResettingGuard(null);
        setNewPassword('');
      } else {
        alert(data.message || 'Failed to reset password.');
      }
    } catch (err) {
      alert('Failed to reset password.');
    }
  };

  const totalGuards = guards.length;
  const activeStaff = guards.filter((g) => g.is_active).length;
  const deactivatedStaff = totalGuards - activeStaff;

  const filteredGuards = guards.filter((g) => {
    const q = searchQuery.toLowerCase();
    return (
      g.full_name.toLowerCase().includes(q) ||
      g.employee_code.toLowerCase().includes(q) ||
      (g.role || '').toLowerCase().includes(q) ||
      (g.site_location || '').toLowerCase().includes(q)
    );
  });

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'Chief Security Officer':
      case 'Admin':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Security Manager':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Supervisor':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Security Hierarchy & Personnel</h1>
            <p className="text-xs text-slate-500 mt-1">
              Configure personnel hierarchy levels, assign mandatory patrol routes, and manage authentication credentials.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" /> Add Security Personnel
          </button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Security Staff</div>
            <div className="text-3xl font-black text-slate-900 mt-2">{totalGuards}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Active Staff</div>
            <div className="text-3xl font-black text-emerald-600 mt-2">{activeStaff}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-500">Deactivated</div>
            <div className="text-3xl font-black text-rose-500 mt-2">{deactivatedStaff}</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, employee code, role, or site..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={fetchData}
            title="Refresh"
            className="p-2 text-slate-500 hover:text-slate-800 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Personnel Hierarchy Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Staff Member</th>
                  <th className="px-4 py-3.5">Role / Hierarchy</th>
                  <th className="px-4 py-3.5">Site / Plant</th>
                  <th className="px-4 py-3.5">Shift Window</th>
                  <th className="px-4 py-3.5">Assigned Patrol Route</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400">
                      Loading personnel records...
                    </td>
                  </tr>
                ) : filteredGuards.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400">
                      No matching records found.
                    </td>
                  </tr>
                ) : (
                  filteredGuards.map((guard) => {
                    const assignedRouteName = guard.rounds?.name || 'No Route Assigned';
                    return (
                      <tr key={guard.guard_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold flex items-center justify-center text-xs">
                              {guard.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{guard.full_name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">Code: {guard.employee_code}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${getRoleBadge(guard.role)}`}>
                            <ShieldCheck className="w-3 h-3" />
                            {guard.role || 'Guard'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-700 font-medium">
                          <div className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {guard.site_location || 'Main Plant'}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          <div className="flex items-center gap-1 font-mono text-[11px]">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {guard.shift_timing || 'Morning'}
                          </div>
                        </td>

                        {/* Assigned Route Cell */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${guard.assigned_round_id ? 'text-blue-700' : 'text-slate-400 italic'}`}>
                              {assignedRouteName}
                            </span>
                            <button
                              onClick={() => {
                                setAssigningGuard(guard);
                                setSelectedRoundId(guard.assigned_round_id || '');
                              }}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {guard.assigned_round_id ? 'Change' : 'Assign'}
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            guard.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {guard.is_active ? 'Active' : 'Deactivated'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setResettingGuard(guard);
                                setNewPassword('');
                              }}
                              className="px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold"
                            >
                              Reset Password
                            </button>
                            <button
                              onClick={() => handleToggleStatus(guard)}
                              className={`px-2.5 py-1 rounded border text-[11px] font-semibold ${
                                guard.is_active
                                  ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {guard.is_active ? 'Deactivate' : 'Activate'}
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

      {/* MODAL 1: Assign Patrol Route to Guard */}
      {assigningGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Route className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Assign Patrol Route</h3>
              </div>
              <button onClick={() => setAssigningGuard(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Assign a mandatory route for <strong className="text-slate-900">{assigningGuard.full_name}</strong>.
              When this guard logs into the mobile app, their assigned checkpoints will load automatically.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Select Patrol Route / Round</label>
              <select
                value={selectedRoundId}
                onChange={(e) => setSelectedRoundId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="">-- No Route Assigned (Free Roam) --</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssigningGuard(null)}
                className="px-4 py-2 border rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRouteAssignment}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold text-white shadow"
              >
                Save Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Register Personnel with Hierarchy */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">Register Security Personnel</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGuard} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Patel"
                  value={newGuard.full_name}
                  onChange={(e) => setNewGuard({ ...newGuard, full_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Employee Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. guard102"
                    value={newGuard.employee_code}
                    onChange={(e) => setNewGuard({ ...newGuard, employee_code: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">App Login Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    value={newGuard.password}
                    onChange={(e) => setNewGuard({ ...newGuard, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Role / Rank</label>
                  <select
                    value={newGuard.role}
                    onChange={(e) => setNewGuard({ ...newGuard, role: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white"
                  >
                    <option value="Guard">Guard / Patrol Staff</option>
                    <option value="Supervisor">Shift Supervisor</option>
                    <option value="Security Manager">Security Manager</option>
                    <option value="Chief Security Officer">Chief Security Officer / Admin</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Assigned Route / Round</label>
                  <select
                    value={newGuard.assigned_round_id}
                    onChange={(e) => setNewGuard({ ...newGuard, assigned_round_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white"
                  >
                    <option value="">-- None --</option>
                    {rounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Site / Deployment Area</label>
                  <input
                    type="text"
                    value={newGuard.site_location}
                    onChange={(e) => setNewGuard({ ...newGuard, site_location: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Shift Timing</label>
                  <select
                    value={newGuard.shift_timing}
                    onChange={(e) => setNewGuard({ ...newGuard, shift_timing: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white"
                  >
                    <option>Morning (06:00 - 14:00)</option>
                    <option>Evening (14:00 - 22:00)</option>
                    <option>Night (22:00 - 06:00)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-white shadow"
                >
                  Create Personnel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Password */}
      {resettingGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Reset Password</h3>
            <p className="text-xs text-slate-600">
              Enter a new login password for <strong>{resettingGuard.full_name}</strong>:
            </p>
            <input
              type="text"
              placeholder="New password (min 6 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none focus:border-blue-500 font-mono"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResettingGuard(null)}
                className="px-3 py-1.5 border rounded-lg text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={!newPassword.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
              >
                Save Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};