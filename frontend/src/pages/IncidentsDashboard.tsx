import React, { useState, useEffect, useMemo } from 'react';
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
  ArrowUpRight
} from 'lucide-react';
import { getSecureMediaUrl } from '../utils/secureMedia';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

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
  assigned_to?: string;
}

export const IncidentsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [guardsMap, setGuardsMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const [searchField, setSearchField] = useState<'number' | 'short_description' | 'caller'>('number');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const [incRes, gRes] = await Promise.all([
        fetch(`${API_BASE}/incidents`),
        fetch(`${API_BASE}/guards`),
      ]);
      const data = await incRes.json();
      const gData = await gRes.json();

      const gMap: Record<string, string> = {};
      (gData.guards || []).forEach((g: any) => {
        gMap[g.guard_id] = `${g.full_name} (${g.employee_code})`;
      });
      setGuardsMap(gMap);

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
              Click any case to assign a Response Group, bind responders, and trigger automatic group email alerts.
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
                  className="px-3 py-2 outline-none w-48 text-slate-800"
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
          </div>
        </div>

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
                        <td className="px-4 py-3.5 text-blue-700 font-semibold whitespace-nowrap">
                          {item.assigned_to || 'Unassigned'}
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