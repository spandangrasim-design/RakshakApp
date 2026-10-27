import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Image as ImageIcon,
  ShieldAlert,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Plus,
  X,
  Paperclip
} from 'lucide-react';
import { getSecureMediaUrl } from '../utils/secureMedia';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

const DEFAULT_GROUPS = [
  'Security Operations L1',
  'Quick Response Team (QRT)',
  'Site Supervisors L2',
  'Fire & Safety Response',
];

interface GuardUser {
  guard_id: string;
  full_name: string;
  employee_code: string;
  site_location?: string;
  is_active?: boolean;
  assignment_group?: string | null;
  assignment_groups?: string[];
}

interface IncidentRecord {
  incident_id?: string;
  id?: string;
  client_incident_id?: string;
  title: string;
  description: string;
  priority?: string;
  status?: string;
  reported_at: string;
  photo_url?: string | null;
  guard_id?: string;
  guards?: { full_name?: string; employee_code?: string } | null;
  category?: string;
  assignment_group?: string;
  assigned_to?: string | null;
}

const calculatePriority = (impact: string, urgency: string): { label: string; code: string } => {
  const imp = impact.charAt(0);
  const urg = urgency.charAt(0);

  if (imp === '1' && urg === '1') return { label: 'P1 - Critical', code: 'P1' };
  if ((imp === '1' && urg === '2') || (imp === '2' && urg === '1')) return { label: 'P2 - High', code: 'P2' };
  if ((imp === '1' && urg === '3') || (imp === '2' && urg === '2') || (imp === '3' && urg === '1')) {
    return { label: 'P3 - Moderate', code: 'P3' };
  }
  return { label: 'P4 - Low', code: 'P4' };
};

export const IncidentsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [guards, setGuards] = useState<GuardUser[]>([]);
  const [guardsMap, setGuardsMap] = useState<Record<string, string>>({});
  const [availableGroups, setAvailableGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [loading, setLoading] = useState<boolean>(true);

  const [searchField, setSearchField] = useState<'number' | 'short_description' | 'caller'>('number');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create Incident Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCallerGuardId, setNewCallerGuardId] = useState('');
  const [newCategory, setNewCategory] = useState('Security / Patrol');
  const [newImpact, setNewImpact] = useState('2 - Medium');
  const [newUrgency, setNewUrgency] = useState('2 - Medium');
  const [newAssignmentGroup, setNewAssignmentGroup] = useState('Security Operations L1');
  const [newDescription, setNewDescription] = useState('');
  const [newPhotoBase64, setNewPhotoBase64] = useState<string | null>(null);
  const [newPhotoName, setNewPhotoName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const getGuardGroups = (g: GuardUser): string[] => {
    if (Array.isArray(g.assignment_groups) && g.assignment_groups.length > 0) {
      return g.assignment_groups;
    }
    if (g.assignment_group && g.assignment_group.trim() !== '') {
      return [g.assignment_group.trim()];
    }
    return ['Security Operations L1'];
  };

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const [incRes, gRes, cfgRes] = await Promise.all([
        fetch(`${API_BASE}/incidents`),
        fetch(`${API_BASE}/guards`),
        fetch(`${API_BASE}/admin/configs`),
      ]);
      const data = await incRes.json();
      const gData = await gRes.json();
      const cfgData = await cfgRes.json();

      const loadedGuards: GuardUser[] = gData.guards || [];
      setGuards(loadedGuards);
      if (loadedGuards.length > 0 && !newCallerGuardId) {
        setNewCallerGuardId(loadedGuards[0].guard_id);
      }

      const gMap: Record<string, string> = {};
      loadedGuards.forEach((g) => {
        gMap[g.guard_id] = `${g.full_name} (${g.employee_code})`;
      });
      setGuardsMap(gMap);

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
      const allGroups = Array.from(groupSet);
      setAvailableGroups(allGroups);
      if (allGroups.length > 0 && !allGroups.includes(newAssignmentGroup)) {
        setNewAssignmentGroup(allGroups[0]);
      }

      const items = data.incidents || data.items || [];
      setIncidents(items);
    } catch (err) {
      console.error('Failed to load incidents', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const computedNewPriority = useMemo(
    () => calculatePriority(newImpact, newUrgency),
    [newImpact, newUrgency]
  );

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be smaller than 5MB.');
      return;
    }
    setNewPhotoName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => setNewPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDescription.trim()) {
      alert('Please enter an incident summary / description.');
      return;
    }

    setIsCreating(true);
    setBanner(null);

    try {
      const payload = {
        guard_id: newCallerGuardId || null,
        title: newDescription.trim().slice(0, 45),
        description: newDescription.trim(),
        category: newCategory,
        impact: newImpact,
        urgency: newUrgency,
        priority: computedNewPriority.code,
        assignment_group: newAssignmentGroup,
        photo_url: newPhotoBase64 || null,
      };

      const res = await fetch(`${API_BASE}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.incident) {
        setShowCreateModal(false);
        setNewDescription('');
        setNewPhotoBase64(null);
        setNewPhotoName(null);
        await fetchIncidents();

        if (data.email_dispatched) {
          setBanner({
            type: 'ok',
            text: `New incident created and automatically dispatched to "${newAssignmentGroup}" (${(
              data.email_recipients || []
            ).join(', ')}).`,
          });
        } else {
          setBanner({
            type: 'err',
            text: `Incident created, but auto-email to "${newAssignmentGroup}" reported: ${
              data.email_error || 'No emails configured for group'
            }`,
          });
        }
      } else {
        alert(data.message || 'Failed to create incident.');
      }
    } catch (err) {
      alert('Network error while creating incident.');
    } finally {
      setIsCreating(false);
    }
  };

  const getCaseCode = (item: IncidentRecord) => {
    const raw = item.client_incident_id || item.incident_id || item.id || '10001';
    const numPart = raw.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6);
    return `RKS-${numPart}`;
  };

  const resolveCallerName = (item: IncidentRecord) => {
    if (item.guards?.full_name) return item.guards.full_name;
    if (item.guard_id && guardsMap[item.guard_id]) return guardsMap[item.guard_id];
    return 'Field Patrol Guard';
  };

  const filteredData = useMemo(() => {
    return incidents.filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if (searchField === 'number') {
        return getCaseCode(item).toLowerCase().includes(q);
      }
      if (searchField === 'short_description') {
        return (item.description || item.title || '').toLowerCase().includes(q);
      }
      if (searchField === 'caller') {
        return resolveCallerName(item).toLowerCase().includes(q);
      }
      return true;
    });
  }, [incidents, searchQuery, searchField, guardsMap]);

  const totalRecords = filteredData.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);

  const openCount = incidents.filter((i) => (i.status || 'OPEN').toUpperCase() !== 'RESOLVED').length;
  const resolvedCount = incidents.filter((i) => (i.status || '').toUpperCase() === 'RESOLVED').length;

  const renderPriorityBadge = (p?: string) => {
    const priority = (p || 'P3').toUpperCase();
    if (priority.includes('1') || priority === 'P1') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[10px]">
          P1 - Critical
        </span>
      );
    }
    if (priority.includes('2') || priority === 'P2') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200 font-bold text-[10px]">
          P2 - High
        </span>
      );
    }
    if (priority.includes('4') || priority === 'P4') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[10px]">
          P4 - Low
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
        P3 - Moderate
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 font-sans text-xs text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top SOC Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Security Dispatch & Incident Queue
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Log new security cases or click any case to assign a Response Group and trigger automatic group email alerts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value as any)}
                className="bg-slate-50 border-r border-slate-200 px-3 py-2 text-slate-700 font-bold outline-none"
              >
                <option value="number">Case ID</option>
                <option value="short_description">Description</option>
                <option value="caller">Reporting Guard</option>
              </select>
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Search cases..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 outline-none w-44 text-slate-800"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2.5" />
              </div>
            </div>

            <button
              onClick={fetchIncidents}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl font-bold shadow-xs transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Create Incident
            </button>
          </div>
        </div>

        {banner && (
          <div
            className={`p-4 rounded-xl border font-bold flex items-center justify-between ${
              banner.type === 'ok'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <span>{banner.text}</span>
            <button onClick={() => setBanner(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-amber-600">Active / Open Cases</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{openCount}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-emerald-600">Resolved Cases</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{resolvedCount}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-blue-600">Total Logged</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{incidents.length}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Modern Rakshak Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900 text-slate-200 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Case ID</th>
                  <th className="px-4 py-3.5">Severity</th>
                  <th className="px-4 py-3.5">Summary</th>
                  <th className="px-4 py-3.5">Reporting Guard (Caller)</th>
                  <th className="px-4 py-3.5">Assignment Group</th>
                  <th className="px-4 py-3.5">Assigned To</th>
                  <th className="px-4 py-3.5">Evidence</th>
                  <th className="px-4 py-3.5">State</th>
                  <th className="px-4 py-3.5">Reported At</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-400">
                      Loading security cases...
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-400">
                      No matching security cases found.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item) => {
                    const rowId = item.client_incident_id || item.incident_id || item.id || '';
                    const caseCode = getCaseCode(item);
                    const securePhoto = getSecureMediaUrl(item.photo_url);
                    const isResolved = (item.status || '').toUpperCase() === 'RESOLVED';

                    return (
                      <tr
                        key={rowId}
                        onClick={() => navigate(`/incidents/${rowId}`)}
                        className="hover:bg-blue-50/50 cursor-pointer transition"
                      >
                        <td className="px-4 py-3.5 font-mono font-black text-blue-600 whitespace-nowrap">
                          {caseCode}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {renderPriorityBadge(item.priority)}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-slate-900 max-w-xs truncate">
                          {item.description || item.title || 'Security patrol incident'}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">
                          {resolveCallerName(item)}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-slate-800 whitespace-nowrap">
                          {item.assignment_group || 'Security Operations L1'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {item.assigned_to ? (
                            <span className="text-blue-700 font-semibold">{item.assigned_to}</span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3.5 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {securePhoto ? (
                            <button
                              type="button"
                              onClick={() => setPreviewPhoto(securePhoto)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                            >
                              <ImageIcon className="w-3.5 h-3.5" /> Photo
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                              isResolved
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isResolved ? 'RESOLVED' : 'ACTIVE'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-500 whitespace-nowrap">
                          {item.reported_at ? new Date(item.reported_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-blue-600 font-bold">
                            Dispatch <ArrowUpRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span className="font-semibold text-slate-600">
              Showing {totalRecords > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(page * pageSize, totalRecords)} of {totalRecords} cases
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create New Incident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Log New Security Incident</h3>
                <p className="text-xs text-slate-500">
                  Creates a new case and automatically emails all members of the selected Assignment Group.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Caller (Reporting Guard) *
                  </label>
                  <select
                    value={newCallerGuardId}
                    onChange={(e) => setNewCallerGuardId(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-semibold"
                  >
                    {guards.map((g) => (
                      <option key={g.guard_id} value={g.guard_id}>
                        {g.full_name} ({g.employee_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-semibold"
                  >
                    <option>Security / Patrol</option>
                    <option>Asset Breach</option>
                    <option>Fire / Hazard</option>
                    <option>Access Control</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Impact</label>
                  <select
                    value={newImpact}
                    onChange={(e) => setNewImpact(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-2.5 py-2 bg-white font-semibold"
                  >
                    <option>1 - High</option>
                    <option>2 - Medium</option>
                    <option>3 - Low</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Urgency</label>
                  <select
                    value={newUrgency}
                    onChange={(e) => setNewUrgency(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-2.5 py-2 bg-white font-semibold"
                  >
                    <option>1 - High</option>
                    <option>2 - Medium</option>
                    <option>3 - Low</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Computed Priority</label>
                  <input
                    type="text"
                    disabled
                    value={computedNewPriority.label}
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 font-black text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Assignment Group (Auto-Emails Group Members) *
                </label>
                <select
                  value={newAssignmentGroup}
                  onChange={(e) => setNewAssignmentGroup(e.target.value)}
                  className="w-full border border-blue-300 bg-blue-50/50 rounded-xl px-3 py-2 font-bold text-blue-950"
                >
                  {availableGroups.map((grp) => {
                    const count = guards.filter(
                      (g) => g.is_active !== false && getGuardGroups(g).includes(grp)
                    ).length;
                    return (
                      <option key={grp} value={grp}>
                        {grp} ({count} members)
                      </option>
                    );
                  })}
                </select>
                <span className="block text-[11px] text-slate-500 mt-1">
                  Assigned To will remain <strong>Unassigned</strong> until a specific member is selected inside the ticket.
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Incident Summary / Description *
                </label>
                <textarea
                  rows={3}
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the security issue, gate/plant location, and immediate observations..."
                  className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  accept="image/*"
                  className="hidden"
                />
                {newPhotoBase64 ? (
                  <div className="flex items-center gap-3 p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                    <img src={newPhotoBase64} alt="Preview" className="h-12 w-12 object-cover rounded-lg" />
                    <span className="text-xs font-semibold text-blue-900 truncate flex-1">
                      {newPhotoName}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewPhotoBase64(null);
                        setNewPhotoName(null);
                      }}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 font-bold text-slate-700"
                  >
                    <Paperclip className="w-3.5 h-3.5" /> Attach Evidence Photo (Optional)
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow disabled:opacity-50"
                >
                  {isCreating ? 'Creating & Dispatching...' : 'Create & Notify Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-2xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <span className="font-bold text-slate-800 text-sm">Field Evidence Photo</span>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center">
              <img src={previewPhoto} alt="Evidence" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentsDashboard;