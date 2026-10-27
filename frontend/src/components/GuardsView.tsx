import React, { useState, useEffect } from 'react';
import {
  Plus,
  ShieldCheck,
  RefreshCw,
  Search,
  Route,
  Clock,
  Building2,
  Edit2,
  CheckSquare,
  Square,
  X,
  Users,
  Mail,
  Phone,
  Trash2,
  FolderPlus
} from 'lucide-react';

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

const DEFAULT_GROUPS = [
  'Security Operations L1',
  'Quick Response Team (QRT)',
  'Site Supervisors L2',
  'Fire & Safety Response',
];

interface RoundItem {
  id: string;
  name: string;
}

interface Guard {
  guard_id: string;
  full_name: string;
  employee_code: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  site_location?: string;
  shift_timing?: string;
  is_active: boolean;
  created_at: string;
  assignment_group?: string | null;
  assignment_groups?: string[];
  assigned_round_id?: string | null;
  assigned_round_ids?: string[];
  reporting_to?: string | null;
  rounds?: { id: string; name: string } | null;
  assigned_rounds?: { id: string; name: string }[];
}

export const GuardsView: React.FC = () => {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [rounds, setRounds] = useState<RoundItem[]>([]);
  const [availableGroups, setAvailableGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageGroupsModal, setShowManageGroupsModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [savingGroups, setSavingGroups] = useState(false);

  const [assigningGuard, setAssigningGuard] = useState<Guard | null>(null);
  const [assigningGroupsGuard, setAssigningGroupsGuard] = useState<Guard | null>(null);
  const [editingGuard, setEditingGuard] = useState<Guard | null>(null);
  const [resettingGuard, setResettingGuard] = useState<Guard | null>(null);

  // Add Form State
  const [newGuard, setNewGuard] = useState({
    full_name: '',
    employee_code: '',
    email: '',
    phone: '',
    password: '',
    role: 'Guard',
    site_location: 'Main Plant & Gate 1',
    shift_timing: 'Morning (06:00 - 14:00)',
    assignment_groups: ['Security Operations L1'] as string[],
    assigned_round_ids: [] as string[],
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'Guard',
    site_location: 'Main Plant & Gate 1',
    shift_timing: 'Morning (06:00 - 14:00)',
    assignment_groups: [] as string[],
    assigned_round_ids: [] as string[],
  });

  const [selectedRoundIds, setSelectedRoundIds] = useState<string[]>([]);
  const [selectedGroupNames, setSelectedGroupNames] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');

  const getGuardGroups = (guard: Guard): string[] => {
    if (Array.isArray(guard.assignment_groups) && guard.assignment_groups.length > 0) {
      return guard.assignment_groups;
    }
    if (guard.assignment_group && guard.assignment_group.trim() !== '') {
      return [guard.assignment_group.trim()];
    }
    return ['Security Operations L1'];
  };

  const getGuardRoundIds = (guard: Guard): string[] => {
    if (Array.isArray(guard.assigned_round_ids) && guard.assigned_round_ids.length > 0) {
      return guard.assigned_round_ids;
    }
    return guard.assigned_round_id ? [guard.assigned_round_id] : [];
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [guardsRes, roundsRes, cfgRes] = await Promise.all([
        fetch(`${API_BASE_URL}/guards`),
        fetch(`${API_BASE_URL}/rounds`),
        fetch(`${API_BASE_URL}/admin/configs`),
      ]);

      const guardsData = await guardsRes.json();
      const roundsData = await roundsRes.json();
      const cfgData = await cfgRes.json();

      const loadedGuards: Guard[] = guardsData.guards || [];
      setGuards(loadedGuards);
      if (roundsData.success) setRounds(roundsData.rounds || []);

      // Merge saved custom groups + any groups already assigned to guards
      let customGroups: string[] = [...DEFAULT_GROUPS];
      if (cfgData.success && Array.isArray(cfgData.configs)) {
        const found = cfgData.configs.find(
          (c: { key_name: string; key_value: string }) => c.key_name === 'CUSTOM_ASSIGNMENT_GROUPS'
        );
        if (found?.key_value) {
          try {
            const parsed = JSON.parse(found.key_value);
            if (Array.isArray(parsed) && parsed.length > 0) {
              customGroups = parsed;
            }
          } catch (_) {}
        }
      }

      const groupSet = new Set<string>(customGroups);
      loadedGuards.forEach((g) => {
        getGuardGroups(g).forEach((grp) => {
          if (grp) groupSet.add(grp);
        });
      });
      setAvailableGroups(Array.from(groupSet));
    } catch (err) {
      console.error('Failed to load guard records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleItemInArray = (arr: string[], item: string): string[] => {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  };

  // Persist custom group list to admin_configurations
  const persistCustomGroups = async (updatedGroups: string[]) => {
    setSavingGroups(true);
    try {
      await fetch(`${API_BASE_URL}/admin/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            key_name: 'CUSTOM_ASSIGNMENT_GROUPS',
            key_value: JSON.stringify(updatedGroups),
          },
        ]),
      });
      setAvailableGroups(updatedGroups);
    } catch (e) {
      alert('Failed to save assignment groups.');
    } finally {
      setSavingGroups(false);
    }
  };

  const handleAddCustomGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    if (availableGroups.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
      alert('An Assignment Group with this name already exists.');
      return;
    }
    const updated = [...availableGroups, trimmed];
    setNewGroupName('');
    await persistCustomGroups(updated);
  };

  const handleDeleteCustomGroup = async (groupToDelete: string) => {
    if (availableGroups.length <= 1) {
      alert('At least one Assignment Group must remain.');
      return;
    }
    if (!window.confirm(`Remove "${groupToDelete}" from Assignment Groups?`)) return;
    const updated = availableGroups.filter((g) => g !== groupToDelete);
    if (selectedGroupFilter === groupToDelete) setSelectedGroupFilter('ALL');
    await persistCustomGroups(updated);
  };

  const handleCreateGuard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuard.full_name.trim() || !newGuard.employee_code.trim() || !newGuard.password.trim()) {
      alert('Please fill all required fields');
      return;
    }

    const groupsToSave =
      newGuard.assignment_groups.length > 0
        ? newGuard.assignment_groups
        : [availableGroups[0] || 'Security Operations L1'];

    try {
      const payload = {
        full_name: newGuard.full_name.trim(),
        employee_code: newGuard.employee_code.trim(),
        email: newGuard.email.trim() || null,
        phone: newGuard.phone.trim() || null,
        password: newGuard.password,
        role: newGuard.role,
        site_location: newGuard.site_location,
        shift_timing: newGuard.shift_timing,
        assignment_groups: groupsToSave,
        assignment_group: groupsToSave[0],
        assigned_round_ids: newGuard.assigned_round_ids,
        assigned_round_id: newGuard.assigned_round_ids[0] || null,
      };

      const res = await fetch(`${API_BASE_URL}/guards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setNewGuard({
          full_name: '',
          employee_code: '',
          email: '',
          phone: '',
          password: '',
          role: 'Guard',
          site_location: 'Main Plant & Gate 1',
          shift_timing: 'Morning (06:00 - 14:00)',
          assignment_groups: [availableGroups[0] || 'Security Operations L1'],
          assigned_round_ids: [],
        });
        fetchData();
      } else {
        alert(data.message || 'Failed to create guard.');
      }
    } catch (err) {
      alert('Error creating guard.');
    }
  };

  const openEditModal = (guard: Guard) => {
    setEditingGuard(guard);
    setEditForm({
      full_name: guard.full_name,
      email: guard.email || '',
      phone: guard.phone || '',
      role: guard.role || 'Guard',
      site_location: guard.site_location || 'Main Plant & Gate 1',
      shift_timing: guard.shift_timing || 'Morning (06:00 - 14:00)',
      assignment_groups: getGuardGroups(guard),
      assigned_round_ids: getGuardRoundIds(guard),
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGuard) return;

    const groupsToSave =
      editForm.assignment_groups.length > 0
        ? editForm.assignment_groups
        : [availableGroups[0] || 'Security Operations L1'];

    try {
      const payload = {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        role: editForm.role,
        site_location: editForm.site_location,
        shift_timing: editForm.shift_timing,
        assignment_groups: groupsToSave,
        assignment_group: groupsToSave[0],
        assigned_round_ids: editForm.assigned_round_ids,
        assigned_round_id: editForm.assigned_round_ids[0] || null,
      };

      const res = await fetch(`${API_BASE_URL}/guards/${editingGuard.guard_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setEditingGuard(null);
        fetchData();
      } else {
        alert(data.message || 'Failed to update details.');
      }
    } catch (err) {
      alert('Network error updating details.');
    }
  };

  const handleSaveRouteAssignment = async () => {
    if (!assigningGuard) return;
    try {
      const res = await fetch(`${API_BASE_URL}/guards/${assigningGuard.guard_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_round_ids: selectedRoundIds,
          assigned_round_id: selectedRoundIds[0] || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAssigningGuard(null);
        fetchData();
      } else {
        alert(data.message || 'Failed to assign routes.');
      }
    } catch (err) {
      alert('Network error while assigning routes.');
    }
  };

  const handleSaveGroupAssignment = async () => {
    if (!assigningGroupsGuard) return;
    const groupsToSave =
      selectedGroupNames.length > 0
        ? selectedGroupNames
        : [availableGroups[0] || 'Security Operations L1'];

    try {
      const res = await fetch(`${API_BASE_URL}/guards/${assigningGroupsGuard.guard_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_groups: groupsToSave,
          assignment_group: groupsToSave[0],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAssigningGroupsGuard(null);
        fetchData();
      } else {
        alert(data.message || 'Failed to update assignment groups.');
      }
    } catch (err) {
      alert('Network error while updating assignment groups.');
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

  const filteredGuards = guards.filter((g) => {
    if (selectedGroupFilter !== 'ALL') {
      const gGroups = getGuardGroups(g);
      if (!gGroups.includes(selectedGroupFilter)) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.full_name.toLowerCase().includes(q) ||
      g.employee_code.toLowerCase().includes(q) ||
      (g.email || '').toLowerCase().includes(q) ||
      (g.role || '').toLowerCase().includes(q) ||
      (g.site_location || '').toLowerCase().includes(q) ||
      getGuardGroups(g).some((grp) => grp.toLowerCase().includes(q))
    );
  });

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'Chief Security Officer':
      case 'Admin':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Security Manager':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Shift Supervisor':
      case 'Supervisor':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const renderMultiGroupSelector = (
    selectedGroups: string[],
    onChange: (newGroups: string[]) => void
  ) => (
    <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
      {availableGroups.map((grp) => {
        const isChecked = selectedGroups.includes(grp);
        return (
          <div
            key={grp}
            onClick={() => onChange(toggleItemInArray(selectedGroups, grp))}
            className={`flex items-center justify-between px-3 py-2 cursor-pointer transition ${
              isChecked
                ? 'bg-emerald-50/90 text-emerald-950 font-bold'
                : 'hover:bg-white text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {isChecked ? (
                <CheckSquare className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
              )}
              <span>{grp}</span>
            </div>
            {isChecked && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                Member
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderMultiRouteSelector = (
    selectedIds: string[],
    onChange: (newIds: string[]) => void
  ) => (
    <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
      {rounds.length === 0 ? (
        <div className="p-3 text-slate-400 text-center italic">No routes created yet</div>
      ) : (
        rounds.map((r) => {
          const isChecked = selectedIds.includes(r.id);
          return (
            <div
              key={r.id}
              onClick={() => onChange(toggleItemInArray(selectedIds, r.id))}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer transition ${
                isChecked ? 'bg-blue-50/80 text-blue-900 font-semibold' : 'hover:bg-white text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isChecked ? (
                  <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
                <span>{r.name}</span>
              </div>
              {isChecked && (
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                  Assigned
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Security Workforce, Assignment Groups & Routes
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Create custom Assignment Groups, bind personnel & notification emails for automatic incident dispatch, and assign patrol routes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowManageGroupsModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
            >
              <Users className="w-4 h-4 text-emerald-400" /> Manage Assignment Groups ({availableGroups.length})
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" /> Add Security Personnel
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Security Staff</div>
            <div className="text-3xl font-black text-slate-900 mt-2">{totalGuards}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Active On-Duty Staff</div>
            <div className="text-3xl font-black text-emerald-600 mt-2">{activeStaff}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Active Assignment Groups</div>
            <div className="text-3xl font-black text-blue-600 mt-2">{availableGroups.length}</div>
          </div>
        </div>

        {/* Assignment Group Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedGroupFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedGroupFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Units ({guards.length})
          </button>
          {availableGroups.map((grp) => {
            const count = guards.filter((g) => getGuardGroups(g).includes(grp)).length;
            const active = selectedGroupFilter === grp;
            return (
              <button
                key={grp}
                onClick={() => setSelectedGroupFilter(grp)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  active
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {grp} ({count})
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, employee code, email, group, or site..."
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
                  <th className="px-4 py-3.5">Staff Member & Contact</th>
                  <th className="px-4 py-3.5">Role / Hierarchy</th>
                  <th className="px-4 py-3.5">Assignment Groups (Incident Dispatch)</th>
                  <th className="px-4 py-3.5">Site & Shift</th>
                  <th className="px-4 py-3.5">Assigned Patrol Routes</th>
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
                    const assignedList =
                      guard.assigned_rounds && guard.assigned_rounds.length > 0
                        ? guard.assigned_rounds
                        : guard.rounds
                        ? [guard.rounds]
                        : [];

                    const memberGroups = getGuardGroups(guard);

                    return (
                      <tr key={guard.guard_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                              {guard.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{guard.full_name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                Code: {guard.employee_code}
                              </div>
                              {guard.email ? (
                                <div className="text-[11px] text-blue-600 flex items-center gap-1 mt-0.5">
                                  <Mail className="w-3 h-3" /> {guard.email}
                                </div>
                              ) : (
                                <div className="text-[10px] text-amber-600 italic mt-0.5">
                                  No email set (Click Edit to add)
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${getRoleBadge(
                              guard.role
                            )}`}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {guard.role || 'Guard'}
                          </span>
                        </td>

                        {/* Multi-Group Cell */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                            {memberGroups.map((grp) => (
                              <span
                                key={grp}
                                className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[10px]"
                              >
                                {grp}
                              </span>
                            ))}
                            <button
                              onClick={() => {
                                setAssigningGroupsGuard(guard);
                                setSelectedGroupNames(memberGroups);
                              }}
                              className="text-[11px] font-bold text-emerald-700 hover:underline ml-1"
                            >
                              Edit Groups
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-700">
                          <div className="flex items-center gap-1 font-semibold">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {guard.site_location || 'Main Plant & Gate 1'}
                          </div>
                          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {guard.shift_timing || 'Morning'}
                          </div>
                        </td>

                        {/* Multi-Route Cell */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {assignedList.length === 0 ? (
                              <span className="text-slate-400 italic">No Route Assigned</span>
                            ) : (
                              assignedList.map((r) => (
                                <span
                                  key={r.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-[11px]"
                                >
                                  {r.name}
                                </span>
                              ))
                            )}
                            <button
                              onClick={() => {
                                setAssigningGuard(guard);
                                setSelectedRoundIds(getGuardRoundIds(guard));
                              }}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline ml-1"
                            >
                              {assignedList.length > 0 ? 'Edit Routes' : '+ Assign'}
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              guard.is_active
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {guard.is_active ? 'Active' : 'Deactivated'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(guard)}
                              className="px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 text-[11px] font-semibold flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={() => {
                                setResettingGuard(guard);
                                setNewPassword('');
                              }}
                              className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold"
                            >
                              Password
                            </button>
                            <button
                              onClick={() => handleToggleStatus(guard)}
                              className={`px-2 py-1 rounded border text-[11px] font-semibold ${
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

      {/* MODAL A: Create & Manage Custom Assignment Groups */}
      {showManageGroupsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Manage Assignment Groups</h3>
              </div>
              <button
                onClick={() => setShowManageGroupsModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Create custom Assignment Groups for your plant. Any group added here can be assigned to multiple guards and selected on Incident tickets.
            </p>

            <form onSubmit={handleAddCustomGroup} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Gate 2 QRT or Electrical Safety L2"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={savingGroups || !newGroupName.trim()}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <FolderPlus className="w-3.5 h-3.5" /> Add
              </button>
            </form>

            <div className="border border-slate-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
              {availableGroups.map((grp) => {
                const memberCount = guards.filter((g) => getGuardGroups(g).includes(grp)).length;
                return (
                  <div key={grp} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{grp}</span>
                      <span className="ml-2 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                        {memberCount} staff
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomGroup(grp)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Delete Group"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowManageGroupsModal(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL B: Quick Multi-Group Assignment Modal */}
      {assigningGroupsGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Assign Response Groups</h3>
              </div>
              <button
                onClick={() => setAssigningGroupsGuard(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Select one or multiple Assignment Groups for{' '}
              <strong className="text-slate-900">{assigningGroupsGuard.full_name}</strong>. When an incident is assigned to any of these groups, they will appear as an eligible responder and receive automatic email alerts.
            </p>

            {renderMultiGroupSelector(selectedGroupNames, setSelectedGroupNames)}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssigningGroupsGuard(null)}
                className="px-4 py-2 border rounded-xl text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGroupAssignment}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white shadow"
              >
                Save Groups ({selectedGroupNames.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Edit Personnel Details */}
      {editingGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Edit Details: {editingGuard.full_name}
              </h3>
              <button onClick={() => setEditingGuard(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Email Address (For Incident Alerts)
                  </label>
                  <input
                    type="email"
                    placeholder="guard@company.com"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91..."
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Role / Rank</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                  >
                    <option value="Guard">Guard / Patrol Staff</option>
                    <option value="Shift Supervisor">Shift Supervisor</option>
                    <option value="Security Manager">Security Manager</option>
                    <option value="Chief Security Officer">Chief Security Officer / Admin</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Shift Timing</label>
                  <select
                    value={editForm.shift_timing}
                    onChange={(e) => setEditForm({ ...editForm, shift_timing: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                  >
                    <option>Morning (06:00 - 14:00)</option>
                    <option>Evening (14:00 - 22:00)</option>
                    <option>Night (22:00 - 06:00)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Site / Deployment Area</label>
                <input
                  type="text"
                  value={editForm.site_location}
                  onChange={(e) => setEditForm({ ...editForm, site_location: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Assignment Groups ({editForm.assignment_groups.length} selected)
                </label>
                {renderMultiGroupSelector(editForm.assignment_groups, (grps) =>
                  setEditForm({ ...editForm, assignment_groups: grps })
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    Assigned Patrol Routes ({editForm.assigned_round_ids.length} selected)
                  </label>
                </div>
                {renderMultiRouteSelector(editForm.assigned_round_ids, (ids) =>
                  setEditForm({ ...editForm, assigned_round_ids: ids })
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingGuard(null)}
                  className="px-4 py-2 border rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-white shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Multi-Route Assignment Modal */}
      {assigningGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Route className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Assign Patrol Routes</h3>
              </div>
              <button onClick={() => setAssigningGuard(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Select one or multiple patrol routes for{' '}
              <strong className="text-slate-900">{assigningGuard.full_name}</strong>.
            </p>

            {renderMultiRouteSelector(selectedRoundIds, setSelectedRoundIds)}

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
                Save Routes ({selectedRoundIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Register New Personnel */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
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
                  placeholder="e.g. Kaushik Vegad"
                  value={newGuard.full_name}
                  onChange={(e) => setNewGuard({ ...newGuard, full_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Employee Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. kaushik"
                    value={newGuard.employee_code}
                    onChange={(e) => setNewGuard({ ...newGuard, employee_code: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 font-mono text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    value={newGuard.password}
                    onChange={(e) => setNewGuard({ ...newGuard, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Email Address (For Incident Alerts)
                  </label>
                  <input
                    type="email"
                    placeholder="guard@company.com"
                    value={newGuard.email}
                    onChange={(e) => setNewGuard({ ...newGuard, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91..."
                    value={newGuard.phone}
                    onChange={(e) => setNewGuard({ ...newGuard, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Role / Rank</label>
                  <select
                    value={newGuard.role}
                    onChange={(e) => setNewGuard({ ...newGuard, role: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                  >
                    <option value="Guard">Guard / Patrol Staff</option>
                    <option value="Shift Supervisor">Shift Supervisor</option>
                    <option value="Security Manager">Security Manager</option>
                    <option value="Chief Security Officer">Chief Security Officer / Admin</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Shift Timing</label>
                  <select
                    value={newGuard.shift_timing}
                    onChange={(e) => setNewGuard({ ...newGuard, shift_timing: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                  >
                    <option>Morning (06:00 - 14:00)</option>
                    <option>Evening (14:00 - 22:00)</option>
                    <option>Night (22:00 - 06:00)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Site / Deployment Area</label>
                <input
                  type="text"
                  value={newGuard.site_location}
                  onChange={(e) => setNewGuard({ ...newGuard, site_location: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Assign to Response Groups ({newGuard.assignment_groups.length} selected)
                </label>
                {renderMultiGroupSelector(newGuard.assignment_groups, (grps) =>
                  setNewGuard({ ...newGuard, assignment_groups: grps })
                )}
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Assign Patrol Routes ({newGuard.assigned_round_ids.length} selected)
                </label>
                {renderMultiRouteSelector(newGuard.assigned_round_ids, (ids) =>
                  setNewGuard({ ...newGuard, assigned_round_ids: ids })
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
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

      {/* MODAL 4: Reset Password */}
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
              className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none focus:border-blue-500 font-mono text-slate-800"
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

export default GuardsView;