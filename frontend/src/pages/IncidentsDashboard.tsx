import { PlantRecord } from '../components/PlantManagementPanel';
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
  Building2,
  SlidersHorizontal,
  Tag,
  AlertOctagon,
  Settings2,
} from 'lucide-react';
import { getSecureMediaUrl } from '../utils/secureMedia';
import { API_V1 as API_BASE } from '../lib/api';

interface GuardUser {
  guard_id: string;
  full_name: string;
  employee_code: string;
  email?: string | null;
  site_location?: string;
  is_active?: boolean;
  assigned_plants?: string[];
}

interface IncidentRecord {
  case_number?: number | null;
  incident_id?: string;
  id?: string;
  client_incident_id?: string;
  title: string;
  description: string;
  priority?: string;
  plant_id?: string | null;
  plant_name?: string;
  plant_code?: string | null;
  status?: string;
  reported_at: string;
  photo_url?: string | null;
  guard_id?: string;
  guards?: { full_name?: string; employee_code?: string } | null;
  category?: string;
  assigned_to?: string | null;
}

const SEVERITY_OPTIONS = [
  { value: 'P1 - Critical', short: 'P1', label: 'P1 · Critical', badge: 'border-rose-200 bg-rose-50 text-rose-700' },
  { value: 'P2 - High', short: 'P2', label: 'P2 · High', badge: 'border-orange-200 bg-orange-50 text-orange-700' },
  { value: 'P3 - Moderate', short: 'P3', label: 'P3 · Moderate', badge: 'border-amber-200 bg-amber-50 text-amber-800' },
  { value: 'P4 - Low', short: 'P4', label: 'P4 · Low', badge: 'border-slate-200 bg-slate-100 text-slate-600' },
];

export const IncidentsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [guards, setGuards] = useState<GuardUser[]>([]);
  const [guardsMap, setGuardsMap] = useState<Record<string, string>>({});
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Super Admin / Tenant controlled field visibility
  const [allowedFields, setAllowedFields] = useState<string[]>([
    'severity',
    'category',
    'title',
    'description',
    'photo',
  ]);
  const [userTier, setUserTier] = useState<string>('USER');

  // Filter & Pagination State
  const [statusTab, setStatusTab] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [plantFilter, setPlantFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchField, setSearchField] = useState<'number' | 'short_description' | 'caller'>('number');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [summaryCounts, setSummaryCounts] = useState({ total: 0, open: 0, resolved: 0 });

  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create Incident Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCallerGuardId, setNewCallerGuardId] = useState('');
  const [newPriority, setNewPriority] = useState('P3 - Moderate');
  const [newCategory, setNewCategory] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [newPlantId, setNewPlantId] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newTitle, setNewTitle] = useState('');
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

  const showSeverity = allowedFields.includes('severity');
  const showCategory = allowedFields.includes('category');
  const showTitle = allowedFields.includes('title');
  const showDescription = allowedFields.includes('description');
  const showPhoto = allowedFields.includes('photo');

  const activePlants = useMemo(() => plants.filter((p) => p.is_active !== false), [plants]);
  const selectedCreatePlant = useMemo(
    () => activePlants.find((p) => p.id === newPlantId) || activePlants[0] || null,
    [activePlants, newPlantId]
  );
  const eligibleCreateResponders = useMemo(() => {
    if (!selectedCreatePlant) return [];
    const assignedIds = selectedCreatePlant.assigned_guard_ids || [];
    return guards.filter(
      (g) =>
        g.is_active !== false &&
        (assignedIds.includes(g.guard_id) ||
          (g.assigned_plants || []).some(
            (p) => p.trim().toLowerCase() === selectedCreatePlant.name.trim().toLowerCase()
          ))
    );
  }, [guards, selectedCreatePlant]);

  const plantCodeByName = useMemo(() => {
    const map: Record<string, string> = {};
    plants.forEach((p) => {
      if (p.plant_code) map[p.name.toLowerCase()] = p.plant_code;
    });
    return map;
  }, [plants]);

  useEffect(() => {
    fetch(`${API_BASE}/guards/my-permissions`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          if (Array.isArray(d.incident_form_fields) && d.incident_form_fields.length > 0) {
            setAllowedFields(d.incident_form_fields);
          }
          if (d.tier) setUserTier(String(d.tier));
        }
      })
      .catch(() => {});

    fetch(`${API_BASE}/incident-categories`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d.categories) ? d.categories : [];
        setCategories(rows);
        setNewCategory((current) =>
          rows.some((x: any) => x.name === current) ? current : rows[0]?.name || 'Security / Patrol'
        );
      })
      .catch(() => setCategories([]));
  }, [authHeaders]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/guards`, { headers: authHeaders })
        .then((r) => r.json())
        .catch(() => ({ guards: [] })),
      fetch(`${API_BASE}/plants`, { headers: authHeaders })
        .then((r) => r.json())
        .catch(() => ({ plants: [] })),
    ]).then(([gData, pData]) => {
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

      const loadedPlants: PlantRecord[] = pData.plants || [];
      setPlants(loadedPlants);
      const firstActive = loadedPlants.find((p) => p.is_active !== false);
      if (firstActive) setNewPlantId(firstActive.id);
    });
  }, [authHeaders]);

  const fetchPaginatedIncidents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (statusTab !== 'ALL') params.set('status', statusTab);
      if (plantFilter !== 'ALL') params.set('plant_name', plantFilter);
      if (debouncedQuery) {
        params.set('q', debouncedQuery);
        params.set('search_field', searchField);
      }

      const res = await fetch(`${API_BASE}/incidents?${params.toString()}`, { headers: authHeaders });
      const data = await res.json();

      const items: IncidentRecord[] = data.incidents || data.items || [];
      setIncidents(items);

      if (data.counts) {
        setSummaryCounts({
          total: data.counts.total ?? items.length,
          open: data.counts.open ?? 0,
          resolved: data.counts.resolved ?? 0,
        });
      } else {
        setSummaryCounts({
          total: items.length,
          open: items.filter((i) => (i.status || 'OPEN').toUpperCase() !== 'RESOLVED').length,
          resolved: items.filter((i) => (i.status || '').toUpperCase() === 'RESOLVED').length,
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
  }, [page, pageSize, statusTab, plantFilter, debouncedQuery, searchField, authHeaders]);

  useEffect(() => {
    fetchPaginatedIncidents();
  }, [fetchPaginatedIncidents]);

  const displayedIncidents = useMemo(() => {
    return incidents.filter((item) => {
      if (severityFilter !== 'ALL') {
        const p = String(item.priority || 'P3').slice(0, 2).toUpperCase();
        if (p !== severityFilter) return false;
      }
      if (categoryFilter !== 'ALL') {
        const cat = String(item.category || 'Security / Patrol').trim().toLowerCase();
        if (cat !== categoryFilter.trim().toLowerCase()) return false;
      }
      return true;
    });
  }, [incidents, severityFilter, categoryFilter]);

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
    if (showDescription && !newDescription.trim() && showTitle && !newTitle.trim()) {
      alert('Please enter an incident title or description.');
      return;
    }

    const chosenPlant = activePlants.find((p) => p.id === newPlantId) || activePlants[0];
    if (!chosenPlant) {
      alert('Please configure at least one active Plant first.');
      return;
    }

    setIsCreating(true);
    setBanner(null);

    try {
      const fallbackSummary =
        newTitle.trim() || newDescription.trim().slice(0, 45) || 'Security Incident';
      const payload = {
        guard_id: newCallerGuardId || null,
        priority: showSeverity ? newPriority : 'P3 - Moderate',
        category: showCategory ? newCategory || 'Security / Patrol' : 'Security / Patrol',
        title: showTitle ? fallbackSummary : fallbackSummary,
        description: showDescription
          ? newDescription.trim() || fallbackSummary
          : fallbackSummary,
        plant_id: chosenPlant.id,
        plant_name: chosenPlant.name,
        plant_code: chosenPlant.plant_code || '',
        assigned_to: newAssignedTo || null,
        photo_url: showPhoto ? newPhotoBase64 || null : null,
      };

      const res = await fetch(`${API_BASE}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.incident) {
        setShowCreateModal(false);
        setNewTitle('');
        setNewDescription('');
        setNewPhotoBase64(null);
        setNewPhotoName(null);
        setPage(1);
        await fetchPaginatedIncidents();

        const label = chosenPlant.plant_code
          ? `${chosenPlant.name} (${chosenPlant.plant_code})`
          : chosenPlant.name;

        if (data.email_dispatched) {
          setBanner({
            type: 'ok',
            text: `Incident created for ${label} and alert dispatched to ${(data.email_recipients || []).join(', ')}.`,
          });
        } else {
          setBanner({
            type: 'err',
            text: `Incident created for ${label}, but auto-email reported: ${
              data.email_error || 'No users with email assigned to this plant'
            }`,
          });
        }
      } else {
        alert(data.message || 'Failed to create incident.');
      }
    } catch {
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

  const formatPlantLabel = (item: IncidentRecord) => {
    const pName = (item.plant_name || '').trim() || 'Main Plant';
    const pCode = (item.plant_code || '').trim() || plantCodeByName[pName.toLowerCase()] || '';
    return pCode ? `${pName} (${pCode})` : pName;
  };

  const getSeverityBadge = (priority?: string) => {
    const code = String(priority || 'P3').slice(0, 2).toUpperCase();
    return SEVERITY_OPTIONS.find((s) => s.short === code) || SEVERITY_OPTIONS[2];
  };

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
      <div className="mx-auto max-w-[1600px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Incidents &amp; Plant Triage Queue
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Plant-based incident routing with Super Admin–controlled form fields and automated alerts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {userTier === 'SUPER_ADMIN' && (
              <button
                type="button"
                onClick={() => navigate('/tenants')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Configure Fields
              </button>
            )}

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

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setStatusTab('ALL');
              setPlantFilter('ALL');
              setSeverityFilter('ALL');
              setCategoryFilter('ALL');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusTab === 'ALL' && plantFilter === 'ALL' && severityFilter === 'ALL' && categoryFilter === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div
                className={`text-[11px] font-bold uppercase ${
                  statusTab === 'ALL' && plantFilter === 'ALL' && severityFilter === 'ALL' && categoryFilter === 'ALL'
                    ? 'text-slate-300'
                    : 'text-slate-500'
                }`}
              >
                All Logged Cases
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold">{summaryCounts.total}</div>
            </div>
            <ShieldAlert
              className={`h-5 w-5 ${
                statusTab === 'ALL' && plantFilter === 'ALL' ? 'text-sky-400' : 'text-slate-400'
              }`}
            />
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

        {/* Filter & Search Toolbar */}
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

            <div className="inline-flex items-center gap-1.5 text-slate-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <select
                value={plantFilter}
                onChange={(e) => {
                  setPlantFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">All Plants</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                    {p.plant_code ? ` (${p.plant_code})` : ''}
                    {p.is_active === false ? ' · Inactive' : ''}
                  </option>
                ))}
              </select>
            </div>

            {showSeverity && (
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">All Severities</option>
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s.short} value={s.short}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}

            {showCategory && categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

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

        {/* Incidents Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="w-[120px] py-3.5 pl-5 pr-3">Case ID</th>
                  <th className="w-[185px] px-3 py-3.5">Plant</th>
                  {showSeverity && <th className="w-[120px] px-3 py-3.5">Severity</th>}
                  {showCategory && <th className="w-[160px] px-3 py-3.5">Category</th>}
                  <th className="px-4 py-3.5">Incident Summary</th>
                  <th className="w-[155px] px-3 py-3.5">Reported By</th>
                  <th className="w-[110px] px-3 py-3.5">Status</th>
                  <th className="w-[140px] px-3 py-3.5">Reported At</th>
                  {showPhoto && <th className="w-[95px] py-3.5 pl-3 pr-5 text-right">Evidence</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={9} className="px-4 py-3.5">
                        <div className="h-5 w-full animate-pulse rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : displayedIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">
                      No incidents found matching your current filter criteria.
                    </td>
                  </tr>
                ) : (
                  displayedIncidents.map((item) => {
                    const caseCode = getCaseCode(item);
                    const targetId = item.client_incident_id || item.incident_id || item.id || '';
                    const isResolved = (item.status || '').toUpperCase() === 'RESOLVED';
                    const sev = getSeverityBadge(item.priority);

                    return (
                      <tr
                        key={targetId || caseCode}
                        onClick={() => targetId && navigate(`/incidents/${encodeURIComponent(targetId)}`)}
                        className="group cursor-pointer transition hover:bg-slate-50/90"
                      >
                        <td className="whitespace-nowrap py-3.5 pl-5 pr-3 font-mono text-xs font-extrabold text-brand-700">
                          <span className="inline-flex items-center gap-1">
                            {caseCode}
                            <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                            <Building2 className="h-3 w-3" />
                            {formatPlantLabel(item)}
                          </span>
                        </td>
                        {showSeverity && (
                          <td className="whitespace-nowrap px-3 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${sev.badge}`}
                            >
                              <AlertOctagon className="h-2.5 w-2.5" />
                              {sev.label}
                            </span>
                          </td>
                        )}
                        {showCategory && (
                          <td className="whitespace-nowrap px-3 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                              <Tag className="h-2.5 w-2.5 text-slate-400" />
                              {item.category || 'Security / Patrol'}
                            </span>
                          </td>
                        )}
                        <td className="max-w-md xl:max-w-xl px-4 py-3.5">
                          <div className="truncate font-bold text-slate-900">
                            {item.title || 'Patrol Incident'}
                          </div>
                          {showDescription && (
                            <div className="truncate text-[11px] text-slate-500">{item.description}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-slate-700">
                          {resolveCallerName(item)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
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
                        <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-slate-500">
                          {item.reported_at
                            ? new Date(item.reported_at).toLocaleString([], {
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        {showPhoto && (
                          <td
                            className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right"
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
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
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
          <div
            className="relative max-h-[85vh] max-w-3xl overflow-hidden rounded-2xl bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute right-4 top-4 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewPhoto}
              alt="Incident Evidence"
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}

      {/* Create Incident Modal (Fields dynamically controlled by Super Admin) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Log New Security Incident</h2>
                <p className="text-[11px] text-slate-500">
                  Fields shown below follow your organization&apos;s Super Admin incident configuration.
                </p>
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
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Plant *</label>
                  <select
                    value={newPlantId}
                    onChange={(e) => {
                      setNewPlantId(e.target.value);
                      setNewAssignedTo('');
                    }}
                    className="w-full rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs font-bold text-indigo-950 outline-none focus:border-brand-500 focus:bg-white"
                  >
                    {activePlants.map((plant) => (
                      <option key={plant.id} value={plant.id}>
                        {plant.name}
                        {plant.plant_code ? ` (${plant.plant_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {showSeverity && (
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-700">Severity Level *</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white"
                    >
                      {SEVERITY_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {showCategory && (
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-700">Category *</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white"
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-700">
                  Assigned Responder ({selectedCreatePlant?.name || 'Selected Plant'})
                </label>
                <select
                  value={newAssignedTo}
                  onChange={(e) => setNewAssignedTo(e.target.value)}
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs font-semibold text-emerald-950 outline-none"
                >
                  <option value="">Unassigned (Group Queue)</option>
                  {eligibleCreateResponders.map((g) => (
                    <option key={g.guard_id} value={g.full_name}>
                      {g.full_name} ({g.employee_code}) — {g.site_location || 'Main Site'}
                    </option>
                  ))}
                </select>
              </div>

              {showTitle && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">
                    Incident Summary / Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Gate 2 perimeter alarm, CCTV offline, unauthorized entry..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white"
                  />
                </div>
              )}

              {showDescription && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-700">
                    Detailed Observations *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Describe what happened, exact checkpoint/gate, and immediate action taken..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-brand-500 focus:bg-white"
                  />
                </div>
              )}

              {showPhoto && (
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
              )}

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
