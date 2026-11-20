import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Paperclip,
  Flame,
  SlidersHorizontal
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
  case_number?: number | null;
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

  // Server-side Filter & Pagination State
  const [statusTab, setStatusTab] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'P1' | 'P2' | 'P3' | 'P4'>('ALL');
  const [searchField, setSearchField] = useState<'number' | 'short_description' | 'caller'>('number');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [summaryCounts, setSummaryCounts] = useState({ total: 0, open: 0, resolved: 0, critical: 0 });

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

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const getGuardGroups = (g: GuardUser): string[] => {
    if (Array.isArray(g.assignment_groups) && g.assignment_groups.length > 0) {
      return g.assignment_groups;
    }
    if (g.assignment_group && g.assignment_group.trim() !== '') {
      return [g.assignment_group.trim()];
    }
    return ['Security Operations L1'];
  };

  // Debounce search input so typing doesn't spam API requests
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load Guards & Assignment Groups once
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/guards`, { headers: authHeaders }).then((r) => r.json()).catch(() => ({ guards: [] })),
      fetch(`${API_BASE}/admin/configs`, { headers: authHeaders }).then((r) => r.json()).catch(() => ({ configs: [] })),
    ]).then(([gData, cfgData]) => {
      const loadedGuards: GuardUser[] = gData.guards || [];
      setGuards(loadedGuards);
      if (loadedGuards.length > 0) {
        setNewCallerGuardId((prev) => prev || loadedGuards[0].guard_id);
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
    });
  }, [authHeaders]);

  // Fetch Paginated Page of Incidents from Server
  const fetchPaginatedIncidents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (statusTab !== 'ALL') params.set('status', statusTab);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (debouncedQuery) {
        params.set('q', debouncedQuery);
        params.set('search_field', searchField);
      }

      const res = await fetch(`${API_BASE}/incidents?${params.toString()}`, { headers: authHeaders });
      const data = await res.json();

      const items: IncidentRecord[] = data.incidents || data.items || [];
      setIncidents(items);

      if (data.counts) {
        setSummaryCounts(data.counts);
      } else {
        setSummaryCounts({
          total: items.length,
          open: items.filter((i) => (i.status || 'OPEN').toUpperCase() !== 'RESOLVED').length,
          resolved: items.filter((i) => (i.status || '').toUpperCase() === 'RESOLVED').length,
          critical: items.filter((i) => ['P1', 'P2'].some((k) => (i.priority || '').toUpperCase().includes(k))).length,
        });
      }

      if (data.pagination) {
        setTotalRecords(data.pagination.total ?? items.length);
        setTotalPages(Math.max(1, data.pagination.total_pages ?? 1));
      } else {
        setTotalRecords(items.length);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Failed to load incidents', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusTab, priorityFilter, debouncedQuery, searchField, authHeaders]);

  useEffect(() => {
    fetchPaginatedIncidents();
  }, [fetchPaginatedIncidents]);

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
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.incident) {
        setShowCreateModal(false);
        setNewDescription('');
        setNewPhotoBase64(null);
        setNewPhotoName(null);
        setPage(1);
        await fetchPaginatedIncidents();

        if (data.email_dispatched) {
          setBanner({
            type: 'ok',
            text: `New incident created and dispatched to "${newAssignmentGroup}" (${(
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
    if (item.case_number) return `RKS-${String(item.case_number).padStart(6, '0')}`;
    const raw = item.client_incident_id || item.incident_id || item.id || '10001';
    const numPart = raw.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6);
    return `RKS-${numPart}`;
  };

  const resolveCallerName = (item: IncidentRecord) => {
    if (item.guards?.full_name) return item.guards.full_name;
    if (item.guard_id && guardsMap[item.guard_id]) return guardsMap[item.guard_id];
    return 'Field Patrol Guard';
  };

  const renderPriorityBadge = (p?: string) => {
    const priority = (p || 'P3').toUpperCase();
    if (priority.includes('1') || priority === 'P1') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          P1 · Critical
        </span>
      );
    }
    if (priority.includes('2') || priority === 'P2') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          P2 · High
        </span>
      );
    }
    if (priority.includes('4') || priority === 'P4') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
          P4 · Low
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
        P3 · Moderate
      </span>
    );
  };

  // Compute compact numbered page window (e.g. 1 ... 4 5 6 ... 20)
  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  }, [page, totalPages]);

  const startItem = totalRecords === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(totalRecords, page * pageSize);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 font-sans text-xs text-slate-800">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Tactical Calm Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Incidents &amp; Triage Queue
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Paginated security incident log with instant priority triage, evidence preview, and response-group dispatch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={fetchPaginatedIncidents}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand-600' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4 text-emerald-400" />
              Log Incident
            </button>
          </div>
        </div>

        {banner && (
          <div
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-bold ${
              banner.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <span>{banner.text}</span>
            <button onClick={() => setBanner(null)} className="rounded p-1 hover:bg-black/5">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Full-Dataset Summary KPI Strip (Reflects all 500+ cases even while paged) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              setStatusTab('ALL');
              setPriorityFilter('ALL');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusTab === 'ALL' && priorityFilter === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold uppercase ${statusTab === 'ALL' && priorityFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                All Logged Cases
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold">{summaryCounts.total}</div>
            </div>
            <ShieldAlert className={`h-5 w-5 ${statusTab === 'ALL' && priorityFilter === 'ALL' ? 'text-sky-400' : 'text-slate-400'}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusTab('OPEN');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusTab === 'OPEN'
                ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-amber-700">Open / Active</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{summaryCounts.open}</div>
            </div>
            <Clock className="h-5 w-5 text-amber-600" />
          </button>

          <button
            type="button"
            onClick={() => {
              setPriorityFilter((p) => (p === 'P1' ? 'ALL' : 'P1'));
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              priorityFilter === 'P1'
                ? 'border-rose-500 bg-rose-50/70 ring-2 ring-rose-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-rose-700">High / Critical (P1–P2)</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{summaryCounts.critical}</div>
            </div>
            <Flame className="h-5 w-5 text-rose-600" />
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusTab('RESOLVED');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusTab === 'RESOLVED'
                ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-emerald-700">Resolved</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{summaryCounts.resolved}</div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </button>
        </div>

        {/* Clean Filter & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'OPEN', 'RESOLVED'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setStatusTab(tab);
                  setPage(1);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  statusTab === tab
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab === 'ALL' ? 'All Status' : tab === 'OPEN' ? 'Open' : 'Resolved'}
              </button>
            ))}

            <div className="mx-1 h-4 w-px bg-slate-200" />

            <div className="inline-flex items-center gap-1 text-slate-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {(['ALL', 'P1', 'P2', 'P3', 'P4'] as const).map((prio) => (
                <button
                  key={prio}
                  type="button"
                  onClick={() => {
                    setPriorityFilter(prio);
                    setPage(1);
                  }}
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                    priorityFilter === prio
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {prio === 'ALL' ? 'Any Priority' : prio}
                </button>
              ))}
            </div>
          </div>

          {/* Server-Side Case / Description / Guard Search */}
          <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:border-brand-500 focus-within:bg-white">
            <select
              value={searchField}
              onChange={(e) => {
                setSearchField(e.target.value as any);
                setPage(1);
              }}
              className="border-r border-slate-200 bg-transparent px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              <option value="number">Case ID</option>
              <option value="short_description">Description</option>
              <option value="caller">Guard</option>
            </select>
            <input
              type="text"
              placeholder="Search across all pages..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-44 bg-transparent px-3 py-1.5 text-xs text-slate-800 outline-none sm:w-56"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="pr-2.5 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Search className="mr-2.5 h-3.5 w-3.5 text-slate-400" />
            )}
          </div>
        </div>

        {/* Clean Paginated Incidents Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Case ID</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Incident Summary</th>
                  <th className="px-4 py-3">Reported By</th>
                  <th className="px-4 py-3">Response Group</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reported At</th>
                  <th className="px-4 py-3 text-right">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={8} className="px-4 py-3.5">
                        <div className="h-5 w-full animate-pulse rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : incidents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                      No incidents found matching your current filter criteria.
                    </td>
                  </tr>
                ) : (
                  incidents.map((item) => {
                    const caseCode = getCaseCode(item);
                    const targetId = item.client_incident_id || item.incident_id || item.id || '';
                    const isResolved = (item.status || '').toUpperCase() === 'RESOLVED';

                    return (
                      <tr
                        key={targetId || caseCode}
                        onClick={() => targetId && navigate(`/incidents/${encodeURIComponent(targetId)}`)}
                        className="group cursor-pointer transition hover:bg-slate-50/90"
                      >
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-extrabold text-brand-700">
                          <span className="inline-flex items-center gap-1">
                            {caseCode}
                            <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">{renderPriorityBadge(item.priority)}</td>
                        <td className="max-w-xs px-4 py-3.5">
                          <div className="truncate font-bold text-slate-900">{item.title || 'Patrol Incident'}</div>
                          <div className="truncate text-[11px] text-slate-500">{item.description}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">
                          {resolveCallerName(item)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                          {item.assignment_group || 'Security Operations L1'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              isResolved
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                          >
                            {item.status || 'OPEN'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[11px] text-slate-500">
                          {item.reported_at
                            ? new Date(item.reported_at).toLocaleString([], {
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.photo_url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewPhoto(getSecureMediaUrl(item.photo_url!))}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                            >
                              <ImageIcon className="h-3.5 w-3.5 text-brand-600" />
                              Photo
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Clean Numbered Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3">
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                Showing <strong className="font-mono text-slate-900">{startItem}</strong>–
                <strong className="font-mono text-slate-900">{endItem}</strong> of{' '}
                <strong className="font-mono text-slate-900">{totalRecords}</strong> cases
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
                disabled={page <= 1 || loading}
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
                      page === pNum
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
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Lightbox Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-h-[85vh] max-w-3xl overflow-hidden rounded-2xl bg-white p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute right-4 top-4 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={previewPhoto} alt="Incident Evidence" className="max-h-[80vh] w-auto rounded-xl object-contain" />
          </div>
        </div>
      )}

      {/* Create Incident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Log New Security Incident</h2>
                <p className="text-[11px] text-slate-500">Automatically calculates ITSM priority and alerts the assigned group.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-3.5 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Reporting Guard</label>
                  <select
                    value={newCallerGuardId}
                    onChange={(e) => setNewCallerGuardId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white"
                  >
                    <option value="">SOC Command Desk</option>
                    {guards.map((g) => (
                      <option key={g.guard_id} value={g.guard_id}>
                        {g.full_name} ({g.employee_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white"
                  >
                    <option>Security / Patrol</option>
                    <option>Fire &amp; Safety</option>
                    <option>Access Control / Gate</option>
                    <option>Equipment / CCTV Fault</option>
                    <option>Visitor / Perimeter Breach</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Impact</label>
                  <select
                    value={newImpact}
                    onChange={(e) => setNewImpact(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold outline-none"
                  >
                    <option>1 - High</option>
                    <option>2 - Medium</option>
                    <option>3 - Low</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Urgency</label>
                  <select
                    value={newUrgency}
                    onChange={(e) => setNewUrgency(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold outline-none"
                  >
                    <option>1 - High</option>
                    <option>2 - Medium</option>
                    <option>3 - Low</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Calculated Priority</label>
                  <div className="flex h-[34px] items-center rounded-xl border border-slate-200 bg-slate-100 px-3 font-extrabold text-slate-800">
                    {computedNewPriority.label}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-700">Assignment Group</label>
                <select
                  value={newAssignmentGroup}
                  onChange={(e) => setNewAssignmentGroup(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white"
                >
                  {availableGroups.map((grp) => (
                    <option key={grp} value={grp}>
                      {grp}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-700">Incident Description *</label>
                <textarea
                  rows={3}
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe what happened, exact checkpoint/gate, and immediate action taken..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-brand-500 focus:bg-white"
                />
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Paperclip className="h-3.5 w-3.5 text-brand-600" />
                  {newPhotoName ? `Attached: ${newPhotoName}` : 'Attach Photo Evidence (Optional)'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create & Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentsDashboard;
