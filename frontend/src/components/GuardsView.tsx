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
  Trash2,
  FolderPlus,
  Sliders,
  ChevronLeft,
  ChevronRight,
  UserCheck
} from 'lucide-react';

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

const DEFAULT_GROUPS = [
  'Security Operations L1',
  'Quick Response Team (QRT)',
  'Site Supervisors L2',
  'Fire & Safety Response',
];

export interface AppPermissions {
  patrol_route: boolean;
  report_incident: boolean;
  incident_tickets: boolean;
  activity_log: boolean;
  sync_queue: boolean;
  incident_option_1_severity: boolean;
  incident_option_2_category: boolean;
  incident_option_3_group: boolean;
  incident_option_4_title: boolean;
  incident_option_5_description: boolean;
  incident_option_6_photo: boolean;
}

const BASIC_GUARD_PERMISSIONS: AppPermissions = {
  patrol_route: true,
  report_incident: true,
  incident_tickets: true,
  activity_log: true,
  sync_queue: true,
  incident_option_1_severity: false,
  incident_option_2_category: false,
  incident_option_3_group: false,
  incident_option_4_title: true,
  incident_option_5_description: true,
  incident_option_6_photo: true,
};

const FULL_ACCESS_PERMISSIONS: AppPermissions = {
  patrol_route: true,
  report_incident: true,
  incident_tickets: true,
  activity_log: true,
  sync_queue: true,
  incident_option_1_severity: true,
  incident_option_2_category: true,
  incident_option_3_group: true,
  incident_option_4_title: true,
  incident_option_5_description: true,
  incident_option_6_photo: true,
};

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
  tenant_id?: string | null;
  tenant_name?: string | null;
  is_guest?: boolean;
  tier?: 'SUPER_ADMIN' | 'INDUSTRY_ADMIN' | 'USER' | string;
  assignment_group?: string | null;
  assignment_groups?: string[];
  assigned_round_id?: string | null;
  assigned_round_ids?: string[];
  selfie_url?: string | null;
  reporting_to?: string | null;
  rounds?: { id: string; name: string } | null;
  assigned_rounds?: { id: string; name: string }[];
  app_permissions?: Partial<AppPermissions>;
  is_custom_override?: boolean;
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
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; name: string; phone?: string | null; code: string } | null>(null);

  // App Permissions Modal State
  const [permissionsGuard, setPermissionsGuard] = useState<Guard | null>(null);
  const [permForm, setPermForm] = useState<AppPermissions>(BASIC_GUARD_PERMISSIONS);
  // Keys this plant bought. Anything not in here is never rendered (no greyed-out rows, no lock icons).
  const [licensedKeys, setLicensedKeys] = useState<Set<string>>(new Set());
  const isLicensed = (k: string) => licensedKeys.has(k);
  const [savingPerms, setSavingPerms] = useState(false);

  // Who is looking at this page? Only the platform Super Admin can change access level / industry.
  const me = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const isSuper = me?.tier === 'SUPER_ADMIN';
  const [tenants, setTenants] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('ALL');
  const ADMIN_ROLES = ['Chief Security Officer', 'Admin', 'Security Manager'];
  const tierLabel = (t?: string) =>
    t === 'SUPER_ADMIN' ? 'Super Admin' : t === 'INDUSTRY_ADMIN' ? 'Industry Admin' : 'App user';

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
    tier: 'USER' as string,
    tenant_id: '' as string,
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
    tier: 'USER' as string,
    tenant_id: '' as string,
    reporting_to: '' as string,
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

  const getGuardPermissions = (guard: Guard): AppPermissions => {
    const isSup = ['Shift Supervisor', 'Security Manager', 'Chief Security Officer', 'Admin'].includes(
      guard.role || ''
    );
    const defaults = isSup ? FULL_ACCESS_PERMISSIONS : BASIC_GUARD_PERMISSIONS;
    return {
      ...defaults,
      ...(guard.app_permissions || {}),
    };
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
      setLicensedKeys(new Set<string>(guardsData.licensed_permission_keys || []));
      setTenants(guardsData.tenants || []);
      if (roundsData.success) setRounds(roundsData.rounds || []);

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

  // Force every key the plant did NOT buy to false so it can never be sent to the server as true.
  const maskToLicensed = (p: AppPermissions, keepLicensedOnly = false): AppPermissions => {
    const out: any = { ...p };
    Object.keys(out).forEach((k) => {
      if (!isLicensed(k)) out[k] = false;
    });
    return keepLicensedOnly ? out : out;
  };

  const openPermissionsModal = (guard: Guard) => {
    setPermissionsGuard(guard);
    setPermForm(getGuardPermissions(guard));
  };

  const handleSavePermissions = async (overridesToSave?: AppPermissions | null) => {
    if (!permissionsGuard) return;
    setSavingPerms(true);
    try {
      const token = localStorage.getItem('token') || '';
      const payload = {
        overrides: overridesToSave !== undefined ? overridesToSave : maskToLicensed(permForm),
      };

      const res = await fetch(`${API_BASE_URL}/access-control/guards/${permissionsGuard.guard_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setPermissionsGuard(null);
        fetchData();
      } else {
        alert(data.message || 'Failed to update app permissions.');
      }
    } catch (e) {
      alert('Network error saving app permissions.');
    } finally {
      setSavingPerms(false);
    }
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

    const storedUser = localStorage.getItem('user');
    const parsedUser = storedUser ? JSON.parse(storedUser) : null;
    const resolvedTenantId = isSuper ? newGuard.tenant_id || null : parsedUser?.tenant_id || (guards[0]?.tenant_id ?? null);
    if (isSuper && !resolvedTenantId) {
      alert('Please choose the industry this person belongs to.');
      return;
    }

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
        tenant_id: resolvedTenantId,
        ...(isSuper ? { tier: newGuard.tier } : {}),
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
          tier: 'USER',
          tenant_id: newGuard.tenant_id,
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
      tier: guard.tier === 'INDUSTRY_ADMIN' ? 'INDUSTRY_ADMIN' : 'USER',
      tenant_id: guard.tenant_id || '',
      reporting_to: guard.reporting_to || '',
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
        reporting_to: editForm.reporting_to || null,
        // Only the platform Super Admin sends these; the server also enforces it.
        ...(isSuper && editingGuard.tier !== 'SUPER_ADMIN'
          ? { tier: editForm.tier, ...(editForm.tenant_id ? { tenant_id: editForm.tenant_id } : {}) }
          : {}),
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
    if (selectedTenantFilter !== 'ALL' && g.tenant_id !== selectedTenantFilter) return false;
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
      (g.tenant_name || '').toLowerCase().includes(q) ||
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

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'ADMINS'>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const displayedGuards = filteredGuards.filter((g) => {
    if (statusFilter === 'ACTIVE') return g.is_active;
    if (statusFilter === 'INACTIVE') return !g.is_active;
    if (statusFilter === 'ADMINS') return g.tier === 'SUPER_ADMIN' || g.tier === 'INDUSTRY_ADMIN';
    return true;
  });

  const adminCount = guards.filter((g) => g.tier === 'SUPER_ADMIN' || g.tier === 'INDUSTRY_ADMIN').length;
  const totalRecords = displayedGuards.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedGuards = displayedGuards.slice((safePage - 1) * pageSize, safePage * pageSize);

  const pageNumbers: (number | 'ellipsis')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (safePage > 3) pageNumbers.push('ellipsis');
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (safePage < totalPages - 2) pageNumbers.push('ellipsis');
    pageNumbers.push(totalPages);
  }

  const startItem = totalRecords === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(totalRecords, safePage * pageSize);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 font-sans text-xs text-slate-800">
      <div className="mx-auto max-w-[1600px] space-y-5">
        {/* Tactical Calm Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              People, Assignment Groups &amp; App Access
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Manage security personnel, custom response units, patrol routes, and granular mobile app permissions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={fetchData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand-600' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowManageGroupsModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100"
            >
              <Users className="h-4 w-4 text-emerald-600" />
              Response Groups ({availableGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4 text-emerald-400" />
              Add Personnel
            </button>
          </div>
        </div>

        {/* Clickable Summary KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('ALL');
              setSelectedGroupFilter('ALL');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusFilter === 'ALL' && selectedGroupFilter === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold uppercase ${statusFilter === 'ALL' && selectedGroupFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Workforce
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold">{totalGuards}</div>
            </div>
            <Users className={`h-5 w-5 ${statusFilter === 'ALL' && selectedGroupFilter === 'ALL' ? 'text-sky-400' : 'text-slate-400'}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('ACTIVE');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusFilter === 'ACTIVE'
                ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-emerald-700">Active On-Duty</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{activeStaff}</div>
            </div>
            <UserCheck className="h-5 w-5 text-emerald-600" />
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('ADMINS');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusFilter === 'ADMINS'
                ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-indigo-700">Console Admins</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{adminCount}</div>
            </div>
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
          </button>

          <button
            type="button"
            onClick={() => setShowManageGroupsModal(true)}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300"
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-blue-700">Response Units</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{availableGroups.length}</div>
            </div>
            <Sliders className="h-5 w-5 text-blue-600" />
          </button>
        </div>

        {/* Clean Filter & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { key: 'ALL', label: 'All Staff' },
              { key: 'ACTIVE', label: 'Active' },
              { key: 'ADMINS', label: 'Admins' },
              { key: 'INACTIVE', label: 'Deactivated' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <div className="mx-1 h-4 w-px bg-slate-200" />

            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedGroupFilter}
                onChange={(e) => {
                  setSelectedGroupFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">All Units ({guards.length})</option>
                {availableGroups.map((grp) => {
                  const count = guards.filter((g) => getGuardGroups(g).includes(grp)).length;
                  return (
                    <option key={grp} value={grp}>
                      {grp} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {isSuper && tenants.length > 0 && (
              <select
                value={selectedTenantFilter}
                onChange={(e) => {
                  setSelectedTenantFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
                title="Filter by industry"
              >
                <option value="ALL">All industries ({guards.length})</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({guards.filter((g) => g.tenant_id === t.id).length})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-brand-500 focus-within:bg-white">
            <Search className="mr-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, code, email, or site..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-48 bg-transparent text-xs text-slate-800 outline-none sm:w-64"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Wide Proportional Personnel Hierarchy Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="w-[250px] py-3.5 pl-5 pr-3">Staff Member &amp; Contact</th>
                  <th className="w-[195px] px-3 py-3.5">Role &amp; Access</th>
                  <th className="w-[210px] px-3 py-3.5">Assignment Groups</th>
                  <th className="w-[175px] px-3 py-3.5">Site &amp; Shift</th>
                  <th className="px-3 py-3.5">Assigned Patrol Routes</th>
                  <th className="w-[105px] px-3 py-3.5">Status</th>
                  <th className="w-[265px] py-3.5 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={7} className="px-5 py-3.5">
                        <div className="h-6 w-full animate-pulse rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : paginatedGuards.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                      No matching personnel records found.
                    </td>
                  </tr>
                ) : (
                  paginatedGuards.map((guard) => {
                    const assignedList =
                      guard.assigned_rounds && guard.assigned_rounds.length > 0
                        ? guard.assigned_rounds
                        : guard.rounds
                        ? [guard.rounds]
                        : [];

                    const memberGroups = getGuardGroups(guard);
                    const perms = getGuardPermissions(guard);
                    const formFieldCount = [
                      'incident_option_1_severity','incident_option_2_category','incident_option_3_group',
                      'incident_option_4_title','incident_option_5_description','incident_option_6_photo',
                    ].filter((k) => isLicensed(k) && (perms as any)[k]).length;

                    return (
                      <tr key={guard.guard_id} className="transition-colors hover:bg-slate-50/90">
                        <td className="py-3.5 pl-5 pr-3">
                          <div className="flex items-center gap-3">
                            {guard.selfie_url ? (
                              <div
                                onClick={() => setSelectedPhoto({ url: guard.selfie_url!, name: guard.full_name, phone: guard.phone, code: guard.employee_code })}
                                className="group relative shrink-0 cursor-pointer"
                                title="Click to verify field registration photo"
                              >
                                <img
                                  src={guard.selfie_url}
                                  alt={guard.full_name}
                                  className="h-10 w-10 rounded-full border-2 border-slate-200 object-cover shadow-xs transition group-hover:border-blue-500"
                                />
                                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 text-[9px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                                  View
                                </div>
                              </div>
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-extrabold text-slate-700">
                                {guard.full_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-bold text-slate-900">{guard.full_name}</div>
                              <div className="font-mono text-[11px] text-slate-400">
                                Code: {guard.employee_code}
                              </div>
                              {guard.email ? (
                                <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-blue-600">
                                  <Mail className="h-3 w-3 shrink-0" /> {guard.email}
                                </div>
                              ) : (
                                <div className="mt-0.5 text-[10px] italic text-amber-600">
                                  No email set
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="space-y-1 px-3 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getRoleBadge(
                              guard.role
                            )}`}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {guard.role || 'Guard'}
                          </span>
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                guard.tier === 'SUPER_ADMIN'
                                  ? 'bg-rose-100 text-rose-700'
                                  : guard.tier === 'INDUSTRY_ADMIN'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                              title={guard.tier === 'USER' ? 'Mobile app only' : 'Can sign in to this web console'}
                            >
                              {tierLabel(guard.tier)}
                            </span>
                            {guard.is_guest && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800" title="Joined from the no-login Field app">
                                Field app
                              </span>
                            )}
                            {isSuper && (
                              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                                {guard.tier === 'SUPER_ADMIN' ? 'Platform' : guard.tenant_name || 'No industry'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-semibold text-slate-500">
                            Mode:{' '}
                            <span className="font-bold text-slate-800">
                              {guard.is_custom_override ? 'Custom Override' : 'Role Default'}
                            </span>
                            {formFieldCount > 0 && (
                              <>
                                {' • '}
                                <span>{formFieldCount} field{formFieldCount === 1 ? '' : 's'}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Multi-Group Cell */}
                        <td className="px-3 py-3.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {memberGroups.map((grp) => (
                              <span
                                key={grp}
                                className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800"
                              >
                                {grp}
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningGroupsGuard(guard);
                                setSelectedGroupNames(memberGroups);
                              }}
                              className="ml-1 text-[11px] font-bold text-emerald-700 hover:underline"
                            >
                              Edit
                            </button>
                          </div>
                        </td>

                        <td className="px-3 py-3.5 text-slate-700">
                          <div className="flex items-center gap-1 font-semibold">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{guard.site_location || 'Main Plant & Gate 1'}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-slate-500">
                            <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                            {guard.shift_timing || 'Morning'}
                          </div>
                        </td>

                        {/* Multi-Route Cell */}
                        <td className="px-3 py-3.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {assignedList.length === 0 ? (
                              <span className="italic text-slate-400">No Route Assigned</span>
                            ) : (
                              assignedList.map((r) => (
                                <span
                                  key={r.id}
                                  className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
                                >
                                  {r.name}
                                </span>
                              ))
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningGuard(guard);
                                setSelectedRoundIds(getGuardRoundIds(guard));
                              }}
                              className="ml-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {assignedList.length > 0 ? 'Edit' : '+ Assign'}
                            </button>
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              guard.is_active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-rose-200 bg-rose-50 text-rose-700'
                            }`}
                          >
                            {guard.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openPermissionsModal(guard)}
                              className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-800 transition hover:bg-purple-100"
                              title="Configure Mobile App Access & Incident Form Options"
                            >
                              <Sliders className="h-3 w-3" /> Access
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(guard)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100"
                            >
                              <Edit2 className="h-3 w-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResettingGuard(guard);
                                setNewPassword('');
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100"
                            >
                              Pass
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(guard)}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                                guard.is_active
                                  ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {guard.is_active ? 'Disable' : 'Enable'}
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

          {/* Numbered Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                Showing <strong className="font-mono text-slate-900">{startItem}</strong>–
                <strong className="font-mono text-slate-900">{endItem}</strong> of{' '}
                <strong className="font-mono text-slate-900">{totalRecords}</strong> staff members
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
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
                disabled={safePage <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>

              {pageNumbers.map((pNum, idx) =>
                pNum === 'ellipsis' ? (
                  <span key={`el-${idx}`} className="px-2 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold transition ${
                      safePage === pNum
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
                disabled={safePage >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SUPER ADMIN MODAL: Mobile App Access Control */}
      {permissionsGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-600" />
                  App Access Control — {permissionsGuard.full_name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Role: <strong className="text-slate-800">{permissionsGuard.role || 'Guard'}</strong> • {permissionsGuard.is_custom_override ? 'Custom Override Active' : 'Inheriting Role Template'}
                </p>
              </div>
              <button
                onClick={() => setPermissionsGuard(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions / Reset to Role Defaults */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 uppercase mr-1">
                Presets:
              </span>
              <button
                type="button"
                onClick={() => setPermForm((prev) => maskToLicensed({ ...prev, ...BASIC_GUARD_PERMISSIONS }, true))}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition"
              >
                Standard Guard
              </button>
              <button
                type="button"
                onClick={() => setPermForm((prev) => maskToLicensed({ ...prev, ...FULL_ACCESS_PERMISSIONS }, true))}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition"
              >
                Supervisor (everything available)
              </button>
              <button
                type="button"
                onClick={() => handleSavePermissions(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition ml-auto"
                title="Clears custom override and inherits Role defaults"
              >
                Reset to Role Template
              </button>
            </div>

            {/* Section 1: Home Action Cards */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                1. Mobile Home Screen Modules ("Patrol Actions")
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {[
                  { key: 'patrol_route', label: 'Patrol Route (Assigned Stops)' },
                  { key: 'report_incident', label: 'Report Incident (Log Issue)' },
                  { key: 'incident_tickets', label: 'Incident Tickets (Active & Resolved)' },
                  { key: 'activity_log', label: 'Activity Log (Recent Scans)' },
                  { key: 'sync_queue', label: 'Sync Queue (Force Upload)' },
                ].filter((mod) => isLicensed(mod.key)).map((mod) => {
                  const checked = permForm[mod.key as keyof AppPermissions];
                  return (
                    <div
                      key={mod.key}
                      onClick={() =>
                        setPermForm((prev) => ({
                          ...prev,
                          [mod.key]: !prev[mod.key as keyof AppPermissions],
                        }))
                      }
                      className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                        checked
                          ? 'bg-blue-50/70 border-blue-300 text-blue-950 font-bold'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span>{mod.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Report Incident Form Options (only the ones this plant bought) */}
            {['incident_option_1_severity','incident_option_2_category','incident_option_3_group','incident_option_4_title','incident_option_5_description','incident_option_6_photo'].some(isLicensed) && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  2. Incident Reporting Form Fields
                </h4>
                <span className="text-[11px] text-slate-500">
                  Unchecked fields are completely hidden from user
                </span>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  {
                    key: 'incident_option_1_severity',
                    label: 'Select Severity Level (P1 - P4)',
                    note: 'If hidden, server automatically sets default P3 - Moderate',
                  },
                  {
                    key: 'incident_option_2_category',
                    label: 'Category Selector',
                    note: 'If hidden, server automatically sets Security / Patrol',
                  },
                  {
                    key: 'incident_option_3_group',
                    label: 'Dispatch Assignment Group',
                    note: 'If hidden, routes automatically to Security Operations L1',
                  },
                  {
                    key: 'incident_option_4_title',
                    label: 'Incident Title / Summary & Quick Chips',
                    note: '1-tap template chips and custom title input',
                  },
                  {
                    key: 'incident_option_5_description',
                    label: 'Detailed Observations & Location',
                    note: 'Field description textarea',
                  },
                  {
                    key: 'incident_option_6_photo',
                    label: 'Field Photo Evidence (Camera)',
                    note: 'Live camera capture attachment',
                  },
                ].filter((opt) => isLicensed(opt.key)).map((opt, idx) => {
                  const checked = permForm[opt.key as keyof AppPermissions];
                  return (
                    <div
                      key={opt.key}
                      onClick={() =>
                        setPermForm((prev) => ({
                          ...prev,
                          [opt.key]: !prev[opt.key as keyof AppPermissions],
                        }))
                      }
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                        checked
                          ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold">Option {idx + 1}: {opt.label}</div>
                          <div className="text-[11px] opacity-75">{opt.note}</div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          checked
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {checked ? 'Visible' : 'Hidden'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setPermissionsGuard(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSavePermissions()}
                disabled={savingPerms}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow disabled:opacity-50"
              >
                {savingPerms ? 'Saving Permissions...' : 'Save App Access Override'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <strong className="text-slate-900">{assigningGroupsGuard.full_name}</strong>.
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

              {isSuper && editingGuard?.tier !== 'SUPER_ADMIN' && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Access level</label>
                    <select
                      value={editForm.tier}
                      onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                    >
                      <option value="USER">App user (mobile app only)</option>
                      <option value="INDUSTRY_ADMIN">Industry Admin (web console)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Industry</label>
                    <select
                      value={editForm.tenant_id}
                      onChange={(e) => setEditForm({ ...editForm, tenant_id: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                    >
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="col-span-2 text-[11px] text-slate-500">
                    The role is only a label. <strong>Access level</strong> decides who can sign in to this console. Moving a person to another industry clears their assigned routes and custom access.
                  </p>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reports to (supervisor)</label>
                <select
                  value={editForm.reporting_to}
                  onChange={(e) => setEditForm({ ...editForm, reporting_to: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                >
                  <option value="">No supervisor</option>
                  {guards
                    .filter((g) => g.guard_id !== editingGuard?.guard_id && (editingGuard?.tenant_id ? g.tenant_id === editingGuard.tenant_id : true))
                    .map((g) => (
                      <option key={g.guard_id} value={g.guard_id}>{g.full_name} · {g.role || 'Guard'}</option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">Daily shift reports for this person are emailed to their supervisor (needs an email on the supervisor's profile).</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Role / Rank</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => {
                      const r = e.target.value;
                      setEditForm({
                        ...editForm,
                        role: r,
                        ...(isSuper && editingGuard?.tier !== 'SUPER_ADMIN'
                          ? { tier: ADMIN_ROLES.includes(r) ? 'INDUSTRY_ADMIN' : 'USER' }
                          : {}),
                      });
                    }}
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

              {isSuper && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Industry *</label>
                    <select
                      required
                      value={newGuard.tenant_id}
                      onChange={(e) => setNewGuard({ ...newGuard, tenant_id: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                    >
                      <option value="">Choose industry…</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Access level</label>
                    <select
                      value={newGuard.tier}
                      onChange={(e) => setNewGuard({ ...newGuard, tier: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-white text-slate-800"
                    >
                      <option value="USER">App user (mobile app only)</option>
                      <option value="INDUSTRY_ADMIN">Industry Admin (web console)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Role / Rank</label>
                  <select
                    value={newGuard.role}
                    onChange={(e) => {
                      const r = e.target.value;
                      setNewGuard({ ...newGuard, role: r, ...(isSuper ? { tier: ADMIN_ROLES.includes(r) ? 'INDUSTRY_ADMIN' : 'USER' } : {}) });
                    }}
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
          {/* Verification Photo Modal (Auto-adjusting) */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 sm:p-5 overflow-hidden animate-in fade-in duration-150"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header (Pinned) */}
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm tracking-wide">Identity Verification</h3>
                <p className="text-[11px] text-slate-300">Registration selfie capture</p>
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="h-7 w-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Auto-Adjusting Scrollable Body */}
            <div className="p-4 flex flex-col items-center bg-slate-50 flex-1 min-h-0 overflow-y-auto">
              {/* Responsive Photo Box */}
              <div className="w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-black/95 flex items-center justify-center shrink-0">
                <img
                  src={selectedPhoto.url}
                  alt={selectedPhoto.name}
                  className="w-full h-auto max-h-[40vh] object-contain"
                />
              </div>

              {/* Guard Profile Details */}
              <div className="w-full mt-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate">{selectedPhoto.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5 truncate">Code: {selectedPhoto.code}</div>
                    {selectedPhoto.phone && (
                      <div className="text-xs text-slate-600 mt-1 font-medium truncate">Phone: {selectedPhoto.phone}</div>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold rounded-md shrink-0">
                    ✓ Verified
                  </span>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setSelectedPhoto(null)}
                className="mt-3 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shrink-0"
              >
                Close Verification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuardsView;