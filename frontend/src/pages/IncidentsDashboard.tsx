import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Info, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Settings, 
  RefreshCw,
  Image as ImageIcon
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
  guards?: { full_name?: string; employee_code?: string };
  category?: string;
  assignment_group?: string;
  assigned_to?: string;
  updated_at?: string;
  updated_by?: string;
}

export const IncidentsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [searchField, setSearchField] = useState<'number' | 'short_description' | 'caller'>('number');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/incidents`);
      const data = await res.json();
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

  const getIncidentNumber = (item: IncidentRecord) => {
    const raw = item.incident_id || item.id || item.client_incident_id || '10001';
    const numPart = raw.replace(/[^0-9]/g, '').slice(-5) || '10001';
    return `INC00${numPart.padStart(5, '0')}`;
  };

  const filteredData = useMemo(() => {
    return incidents.filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if (searchField === 'number') {
        return getIncidentNumber(item).toLowerCase().includes(q);
      }
      if (searchField === 'short_description') {
        return (item.description || item.title || '').toLowerCase().includes(q);
      }
      if (searchField === 'caller') {
        const caller = item.guards?.full_name || 'Rahul Sharma';
        return caller.toLowerCase().includes(q);
      }
      return true;
    });
  }, [incidents, searchQuery, searchField]);

  const totalRecords = filteredData.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(paginatedData.map((d) => d.incident_id || d.id || '')));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderPriority = (p?: string) => {
    const priority = (p || 'P4').toUpperCase();
    if (priority.includes('1') || priority === 'CRITICAL' || priority === 'P1') {
      return (
        <span className="flex items-center gap-1.5 text-slate-900 font-medium whitespace-nowrap">
          <span className="h-2 w-2 rounded-full bg-[#d9383a] inline-block" />
          1 - Critical
        </span>
      );
    }
    if (priority.includes('2') || priority === 'HIGH' || priority === 'P2') {
      return (
        <span className="flex items-center gap-1.5 text-slate-900 font-medium whitespace-nowrap">
          <span className="h-2 w-2 rounded-full bg-[#f58220] inline-block" />
          2 - High
        </span>
      );
    }
    if (priority.includes('3') || priority === 'MEDIUM' || priority === 'MODERATE' || priority === 'P3') {
      return (
        <span className="flex items-center gap-1.5 text-slate-800 whitespace-nowrap">
          <span className="h-2 w-2 rounded-full bg-[#0072ce] inline-block" />
          3 - Moderate
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-slate-700 whitespace-nowrap">
        4 - Low
      </span>
    );
  };

  const getSnowState = (status?: string) => {
    const s = (status || 'OPEN').toUpperCase();
    if (s === 'RESOLVED') return 'Resolved';
    if (s === 'IN_PROGRESS') return 'In Progress';
    if (s === 'CLOSED') return 'Closed';
    return 'New';
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#293e40] font-sans text-xs">
      {/* Top ServiceNow Header Bar */}
      <div className="bg-[#e6e8ea] border-b border-[#bdc3c7] px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-slate-800 tracking-tight">Incidents</span>

          <button
            type="button"
            onClick={() => navigate('/incidents/new')}
            className="rounded bg-[#1f8466] hover:bg-[#186a52] text-white font-semibold px-3 py-1 text-xs shadow-sm transition"
          >
            New
          </button>

          <div className="flex items-center border border-[#9ca3af] rounded bg-white overflow-hidden shadow-inner">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as any)}
              className="bg-[#f3f4f6] border-r border-[#9ca3af] px-2 py-1 text-slate-700 outline-none font-medium cursor-pointer"
            >
              <option value="number">Number</option>
              <option value="short_description">Short description</option>
              <option value="caller">Caller</option>
            </select>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="px-2 py-1 outline-none w-48 text-slate-800"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-slate-600">
          <button
            onClick={fetchIncidents}
            title="Refresh List"
            className="p-1 hover:text-slate-900 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <span className="font-medium text-slate-700">
            {totalRecords > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(page * pageSize, totalRecords)} of {totalRecords}
          </span>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Grid */}
      <div className="overflow-x-auto bg-white border-b border-slate-300">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#f0f2f4] text-slate-700 border-b border-slate-300 select-none">
            <tr>
              <th className="w-7 px-2 py-2 text-center border-r border-slate-200">
                <input
                  type="checkbox"
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  checked={paginatedData.length > 0 && selectedIds.size === paginatedData.length}
                  className="rounded border-slate-400 text-blue-600 focus:ring-0 cursor-pointer"
                />
              </th>
              <th className="w-7 px-2 py-2 text-center border-r border-slate-200">
                <Settings className="w-3.5 h-3.5 text-slate-400 mx-auto" />
              </th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Number</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Opened</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Short description</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Caller</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Priority</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">State</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Category</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200 text-center">Evidence Photo</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Assignment group</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Assigned to</th>
              <th className="px-3 py-2 font-semibold border-r border-slate-200">Updated</th>
              <th className="px-3 py-2 font-semibold">Updated by</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={14} className="py-8 text-center text-slate-400">
                  Loading incident records...
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-8 text-center text-slate-400">
                  No records to display
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => {
                const rowId = item.incident_id || item.id || '';
                const incNumber = getIncidentNumber(item);
                const isSelected = selectedIds.has(rowId);
                const securePhoto = getSecureMediaUrl(item.photo_url);

                return (
                  <tr
                    key={rowId}
                    className={`hover:bg-[#eef2f6] transition-colors ${
                      isSelected ? 'bg-[#e7f1ff]' : 'odd:bg-white even:bg-[#fafafa]'
                    }`}
                  >
                    <td className="px-2 py-1.5 text-center border-r border-slate-200">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(rowId)}
                        className="rounded border-slate-400 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    <td className="px-2 py-1.5 text-center border-r border-slate-200">
                      <button
                        type="button"
                        onClick={() => navigate(`/incidents/${rowId}`)}
                        className="text-slate-400 hover:text-blue-600 transition"
                        title="Open incident record"
                      >
                        <Info className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 whitespace-nowrap font-medium">
                      <button
                        type="button"
                        onClick={() => navigate(`/incidents/${rowId}`)}
                        className="text-[#1b6acb] hover:underline font-mono"
                      >
                        {incNumber}
                      </button>
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                      {item.reported_at ? new Date(item.reported_at).toLocaleString() : 'N/A'}
                    </td>

                    <td 
                      className="px-3 py-1.5 border-r border-slate-200 max-w-xs truncate text-slate-900 font-medium" 
                      title={item.description || item.title}
                    >
                      {item.description || item.title || 'Security patrol incident'}
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 whitespace-nowrap text-slate-800">
                      {item.guards?.full_name || 'Rahul Sharma'}
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 whitespace-nowrap">
                      {renderPriority(item.priority)}
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 whitespace-nowrap text-slate-700">
                      {getSnowState(item.status)}
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 text-slate-600 whitespace-nowrap">
                      {item.category || 'Security / Patrol'}
                    </td>

                    {/* Evidence Photo Preview with secure gateway fallback */}
                    <td className="px-3 py-1.5 border-r border-slate-200 text-center whitespace-nowrap">
                      {securePhoto ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto(securePhoto)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <ImageIcon className="w-3.5 h-3.5" /> View Photo
                        </button>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">(none)</span>
                      )}
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 text-slate-600 whitespace-nowrap">
                      {item.assignment_group || 'Site Security L1'}
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 text-slate-400 italic whitespace-nowrap">
                      {item.assigned_to || '(empty)'}
                    </td>

                    <td className="px-3 py-1.5 border-r border-slate-200 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                      {item.updated_at ? new Date(item.updated_at).toLocaleString() : new Date(item.reported_at).toLocaleString()}
                    </td>

                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">
                      {item.updated_by || 'system'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Lightbox Photo Preview Modal */}
      {previewPhoto && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewPhoto(null)}
        >
          <div 
            className="relative max-w-2xl w-full bg-white rounded-xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <span className="font-bold text-slate-800 text-sm">Incident Photo Evidence</span>
              <button 
                onClick={() => setPreviewPhoto(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
              <img 
                src={previewPhoto} 
                alt="Incident Evidence" 
                className="w-full h-full object-contain" 
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentsDashboard;