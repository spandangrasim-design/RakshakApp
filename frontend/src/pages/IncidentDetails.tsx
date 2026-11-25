import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Paperclip,
  Send,
  X,
  AlertCircle,
  CheckCircle2,
  Users,
  UserCheck,
  Trash2,
  Building2
} from 'lucide-react';
import { getSecureMediaUrl } from '../utils/secureMedia';
import { PlantRecord } from '../components/PlantManagementPanel';

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

interface GuardUser {
  guard_id: string;
  full_name: string;
  employee_code: string;
  email?: string | null;
  role?: string;
  site_location?: string;
  is_active?: boolean;
}

interface Incident {
  client_incident_id: string;
  guard_id?: string;
  title?: string;
  description: string;
  plant_name?: string;
  status: string;
  photo_url: string | null;
  reported_at: string;
  category?: string;
  assignment_group?: string;
  assigned_to?: string | null;
  resolution_code?: string;
  resolution_notes?: string;
  resolved_by?: string;
  resolved_at?: string;
}

interface IncidentUpdate {
  id: string;
  incident_id: string;
  sender_type: 'guard' | 'admin';
  sender_name: string;
  message: string;
  photo_url: string | null;
  created_at: string;
}

export const IncidentDetails: React.FC<{ user?: any }> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [updates, setUpdates] = useState<IncidentUpdate[]>([]);
  const [guards, setGuards] = useState<GuardUser[]>([]);
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'notes' | 'resolution'>('notes');

  // Case Fields
  const [callerGuardId, setCallerGuardId] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [category, setCategory] = useState('Security / Patrol');
  const [plantName, setPlantName] = useState('Test - P1');
  const [state, setState] = useState('Active');
  const [assignedTo, setAssignedTo] = useState('');

  // Resolution Fields
  const [resolutionCode, setResolutionCode] = useState('Solved (Permanently)');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionError, setResolutionError] = useState(false);

  // Activity Log Fields
  const [workNoteMessage, setWorkNoteMessage] = useState('');
  const [selectedPhotoBase64, setSelectedPhotoBase64] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolutionNotesRef = useRef<HTMLTextAreaElement>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const selectedPlantObj = useMemo(
    () => plants.find((p) => p.name === plantName) || null,
    [plants, plantName]
  );

  const eligibleGuardsForPlant = useMemo(() => {
    const activeGuards = guards.filter((g) => g.is_active !== false);
    const ids = selectedPlantObj?.assigned_guard_ids || [];
    if (ids.length === 0) return activeGuards;
    return activeGuards.filter((g) => ids.includes(g.guard_id));
  }, [guards, selectedPlantObj]);

  const fetchAllDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);

      const [incRes, guardsRes, plantsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/incidents/${encodeURIComponent(id)}`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/guards`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/plants`, { headers: authHeaders }),
      ]);

      const data = await incRes.json();
      const guardsData = await guardsRes.json();
      const plantsData = await plantsRes.json();

      const loadedGuards: GuardUser[] = guardsData.guards || [];
      const loadedPlants: PlantRecord[] = plantsData.plants || [];
      setGuards(loadedGuards);
      setPlants(loadedPlants);

      let currentInc: Incident | null = null;
      let rawUpdates: IncidentUpdate[] = [];

      if (data.success && data.incident) {
        currentInc = data.incident;
        rawUpdates = data.updates || [];
      }

      if (currentInc) {
        setIncident(currentInc);
        setCallerGuardId(currentInc.guard_id || loadedGuards[0]?.guard_id || '');
        setShortDescription(currentInc.description || currentInc.title || 'Security Patrol Incident');
        setCategory(currentInc.category || 'Security / Patrol');

        const resolvedPlant =
          (currentInc.plant_name || '').trim() ||
          loadedPlants.find((p) => p.is_active !== false)?.name ||
          'Test - P1';
        setPlantName(resolvedPlant);

        setState(
          currentInc.status === 'RESOLVED'
            ? 'Resolved'
            : currentInc.status === 'CLOSED'
            ? 'Closed'
            : 'Active'
        );
        setAssignedTo(currentInc.assigned_to || '');

        if (currentInc.resolution_code) setResolutionCode(currentInc.resolution_code);
        if (currentInc.resolution_notes) setResolutionNotes(currentInc.resolution_notes);

        const sortedUpdates = [...rawUpdates].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setUpdates(sortedUpdates);
      } else {
        setIncident(null);
      }
    } catch (err) {
      console.error('Failed to load incident details:', err);
      setIncident(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllDetails();
  }, [id]);

  const handleUpdateIncident = async () => {
    if (!incident) return;
    setIsUpdating(true);
    setStatusBanner(null);

    const mappedTeam = selectedPlantObj?.team_name || plantName;

    try {
      const payload = {
        description: shortDescription,
        category,
        plant_name: plantName,
        assignment_group: mappedTeam,
        status: state === 'Resolved' ? 'RESOLVED' : state === 'Closed' ? 'CLOSED' : 'OPEN',
        assigned_to: assignedTo.trim() || null,
        guard_id: callerGuardId,
        updated_by: user?.full_name || 'SOC Command Admin',
        work_note: workNoteMessage.trim() || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/incidents/${incident.client_incident_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        if (data.incident) setIncident(data.incident);
        if (data.activity) setUpdates((prev) => [data.activity, ...prev]);
        setWorkNoteMessage('');

        if (data.email_triggered) {
          if (data.email_dispatched) {
            setStatusBanner({
              type: 'ok',
              text: `Case updated. Dispatch email sent to "${plantName}" team (${(
                data.email_recipients || []
              ).join(', ')}).`,
            });
          } else {
            setStatusBanner({
              type: 'err',
              text: `Case saved, but auto-email failed: ${data.email_error}`,
            });
          }
        } else {
          setStatusBanner({ type: 'ok', text: 'Case updated successfully.' });
        }
      } else {
        setStatusBanner({ type: 'err', text: data.message || 'Failed to update case.' });
      }
    } catch {
      setStatusBanner({ type: 'err', text: 'Network error while saving changes.' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResolveIncident = async () => {
    if (!incident) return;

    if (!resolutionNotes.trim()) {
      setActiveTab('resolution');
      setResolutionError(true);
      setTimeout(() => resolutionNotesRef.current?.focus(), 150);
      return;
    }

    setResolutionError(false);
    setIsResolving(true);

    try {
      const payload = {
        resolution_code: resolutionCode,
        resolution_notes: resolutionNotes.trim(),
        resolved_by: user?.full_name || assignedTo || 'SOC Command Admin',
      };

      const res = await fetch(`${API_BASE_URL}/incidents/${incident.client_incident_id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setIncident((prev) =>
          prev
            ? {
                ...prev,
                status: 'RESOLVED',
                resolution_code: resolutionCode,
                resolution_notes: resolutionNotes.trim(),
              }
            : null
        );
        setState('Resolved');

        if (data.activity) setUpdates((prev) => [data.activity, ...prev]);
        setActiveTab('notes');
        setStatusBanner({ type: 'ok', text: 'Case resolved and logged to dispatch timeline.' });
      }
    } finally {
      setIsResolving(false);
    }
  };

  const handleDeleteIncident = async () => {
    if (!incident || !window.confirm('Delete this security case record permanently?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/incidents/${incident.client_incident_id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (data.success) navigate('/incidents');
    } catch {}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File must be smaller than 5MB.');
      return;
    }
    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => setSelectedPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handlePostWorkNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workNoteMessage.trim() && !selectedPhotoBase64) return;
    setIsSending(true);

    try {
      const payload = {
        sender_type: 'admin',
        sender_name: user?.full_name || assignedTo || 'SOC Command',
        message: workNoteMessage.trim(),
        photo_base64: selectedPhotoBase64,
      };

      const res = await fetch(`${API_BASE_URL}/incidents/${incident?.client_incident_id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.update) {
        setUpdates((prev) => [data.update, ...prev]);
        setWorkNoteMessage('');
        setSelectedPhotoBase64(null);
        setSelectedFileName(null);
      }
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <div className="text-xs font-bold text-slate-500">Loading Rakshak Dispatch Console...</div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-8 text-center bg-slate-50 min-h-screen">
        <h2 className="text-base font-bold text-slate-800">Security Case Not Found</h2>
        <button
          onClick={() => navigate('/incidents')}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow"
        >
          Back to Case Queue
        </button>
      </div>
    );
  }

  const caseDisplayCode = (incident as any).case_number
    ? `RKS-${String((incident as any).case_number).padStart(6, '0')}`
    : incident.client_incident_id
    ? `RKS-${incident.client_incident_id.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6)}`
    : 'RKS-100210';

  const initialPhotoUrl = getSecureMediaUrl(incident.photo_url);

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-xs text-slate-800 pb-12">
      {/* Header Bar */}
      <div className="bg-slate-900 text-white px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/incidents')}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
              title="Back to Case Queue"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-blue-600 font-mono font-black text-xs">
                  {caseDisplayCode}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 font-bold text-[11px]">
                  <Building2 className="w-3 h-3" />
                  {plantName}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-[11px]">
                  {state}
                </span>
              </div>
              <h1 className="text-sm font-bold text-slate-200 mt-1">
                Rakshak Security Dispatch Console
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleUpdateIncident}
              disabled={isUpdating}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-bold shadow-sm transition disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Update Case'}
            </button>

            {state !== 'Resolved' && (
              <button
                type="button"
                onClick={handleResolveIncident}
                disabled={isResolving}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 font-bold shadow-sm transition disabled:opacity-50"
              >
                {isResolving ? 'Resolving...' : 'Resolve Case'}
              </button>
            )}

            <button
              type="button"
              onClick={handleDeleteIncident}
              className="p-2 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition"
              title="Delete Case"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-6 px-4 space-y-6">
        {statusBanner && (
          <div
            className={`p-4 rounded-xl border font-bold flex items-center justify-between ${
              statusBanner.type === 'ok'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <span>{statusBanner.text}</span>
            <button onClick={() => setStatusBanner(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2-Card Dispatch Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Reporter & Category */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                1. Field Reporter &amp; Classification
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Case Reference
                </label>
                <input
                  type="text"
                  disabled
                  value={caseDisplayCode}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Reported Timestamp
                </label>
                <input
                  type="text"
                  disabled
                  value={new Date(incident.reported_at).toLocaleString()}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Caller (Reporting Field Guard)
              </label>
              <select
                value={callerGuardId}
                onChange={(e) => setCallerGuardId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-slate-50 font-bold text-slate-900 outline-none focus:border-blue-600"
              >
                {guards.map((g) => (
                  <option key={g.guard_id} value={g.guard_id}>
                    {g.full_name} ({g.employee_code}) — {g.site_location || 'Main Site'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-2.5 py-2 bg-white font-semibold outline-none"
              >
                <option>Security / Patrol</option>
                <option>Asset Breach</option>
                <option>Fire / Hazard</option>
                <option>Access Control</option>
              </select>
            </div>
          </div>

          {/* Card 2: Unified Plant Routing & Bound Responder */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  2. Plant Routing &amp; Bound Assignee
                </h2>
              </div>
              <span className="text-[11px] font-bold text-slate-500">
                {eligibleGuardsForPlant.length} staff eligible
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Operational State
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-bold text-slate-800 outline-none"
              >
                <option>Active</option>
                <option>In Progress</option>
                <option>Resolved</option>
                <option>Closed</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Plant Name &amp; Mapped Team
              </label>
              <select
                value={plantName}
                onChange={(e) => {
                  setPlantName(e.target.value);
                  setAssignedTo('');
                }}
                className="w-full border border-indigo-300 bg-indigo-50/50 rounded-xl px-3 py-2 font-bold text-indigo-950 outline-none"
              >
                {plants.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}{p.team_name ? ` — ${p.team_name}` : ''}{p.is_active === false ? ' (Disabled)' : ''}
                  </option>
                ))}
                {!plants.some((p) => p.name === plantName) && (
                  <option value={plantName}>{plantName}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Assigned Responder (Mapped to &ldquo;{plantName}&rdquo;)
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full border border-emerald-300 bg-emerald-50/40 rounded-xl px-3 py-2 font-bold text-emerald-950 outline-none"
              >
                <option value="">-- Unassigned (Plant Team Queue) --</option>
                {eligibleGuardsForPlant.map((g) => (
                  <option key={g.guard_id} value={g.full_name}>
                    {g.full_name} ({g.employee_code}) — {g.role || 'Guard'}
                    {g.email ? ` • ${g.email}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary & Field Evidence Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">
              Incident Summary / Description
            </label>
            <input
              type="text"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 font-semibold text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          {initialPhotoUrl && (
            <div className="pt-2">
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">
                Field Photo Evidence
              </label>
              <a href={initialPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                <img
                  src={initialPhotoUrl}
                  alt="Field Evidence"
                  className="max-h-52 rounded-xl border border-slate-200 object-contain shadow-sm"
                />
              </a>
            </div>
          )}
        </div>

        {/* Tabs: Dispatch Activity Stream vs Resolution Details */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 pt-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`px-5 py-2.5 font-bold text-xs rounded-t-xl transition ${
                activeTab === 'notes'
                  ? 'bg-white text-blue-700 border border-b-0 border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dispatch Activity Stream ({updates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('resolution')}
              className={`px-5 py-2.5 font-bold text-xs rounded-t-xl transition flex items-center gap-1.5 ${
                activeTab === 'resolution'
                  ? 'bg-white text-blue-700 border border-b-0 border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              } ${resolutionError ? 'text-rose-600' : ''}`}
            >
              Resolution &amp; Closure Details
              {state === 'Resolved' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              {resolutionError && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
            </button>
          </div>

          {activeTab === 'notes' && (
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="font-bold text-slate-700">
                  Post Dispatch Note / Responder Instructions
                </label>

                {selectedPhotoBase64 && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-xl">
                    <img src={selectedPhotoBase64} alt="Preview" className="h-10 w-10 object-cover rounded-lg" />
                    <span className="text-xs text-blue-900 truncate flex-1">{selectedFileName}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPhotoBase64(null)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <textarea
                  rows={3}
                  value={workNoteMessage}
                  onChange={(e) => setWorkNoteMessage(e.target.value)}
                  placeholder="Enter instructions for the assigned plant team..."
                  className="w-full border border-slate-300 rounded-xl bg-slate-50 p-3 outline-none focus:bg-white focus:border-blue-600 text-slate-800"
                />

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-slate-700 font-bold border border-slate-300 rounded-xl px-3 py-1.5 bg-white hover:bg-slate-50"
                    >
                      <Paperclip className="w-3.5 h-3.5" /> Attach Photo
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handlePostWorkNote}
                    disabled={isSending || (!workNoteMessage.trim() && !selectedPhotoBase64)}
                    className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" /> Post Dispatch Note
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100">
                <span className="font-bold text-slate-600 uppercase tracking-wider text-[11px] block">
                  Case Audit &amp; Dispatch History
                </span>

                {updates.length === 0 ? (
                  <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center text-slate-400">
                    No activity logs recorded yet.
                  </div>
                ) : (
                  updates.map((update) => {
                    const photo = getSecureMediaUrl(update.photo_url);
                    return (
                      <div
                        key={update.id}
                        className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-900">{update.sender_name}</span>
                          <span className="font-mono text-slate-500">
                            {new Date(update.created_at).toLocaleString()}
                          </span>
                        </div>
                        {update.message && (
                          <p className="text-slate-800 whitespace-pre-line">{update.message}</p>
                        )}
                        {photo && (
                          <a href={photo} target="_blank" rel="noopener noreferrer" className="block pt-1">
                            <img
                              src={photo}
                              alt="Attachment"
                              className="max-h-40 rounded-lg border border-slate-200"
                            />
                          </a>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'resolution' && (
            <div className="p-6 space-y-4">
              <div className="max-w-2xl space-y-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Resolution Classification *
                  </label>
                  <select
                    value={resolutionCode}
                    onChange={(e) => setResolutionCode(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-semibold"
                  >
                    <option>Solved (Permanently)</option>
                    <option>Solved (Work Around)</option>
                    <option>Resolved by Patrol Guard</option>
                    <option>Not an Incident / False Alarm</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Mandatory Resolution Summary *
                  </label>
                  <textarea
                    ref={resolutionNotesRef}
                    rows={4}
                    value={resolutionNotes}
                    onChange={(e) => {
                      setResolutionNotes(e.target.value);
                      if (e.target.value.trim()) setResolutionError(false);
                    }}
                    placeholder="Describe physical verification steps and how the incident was resolved..."
                    className={`w-full border rounded-xl p-3 outline-none ${
                      resolutionError ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300'
                    }`}
                  />
                  {resolutionError && (
                    <p className="text-[11px] font-bold text-rose-600 mt-1">
                      Please provide resolution notes before closing this case.
                    </p>
                  )}
                </div>

                {state !== 'Resolved' && (
                  <button
                    type="button"
                    onClick={handleResolveIncident}
                    disabled={isResolving}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 font-bold shadow transition"
                  >
                    {isResolving ? 'Resolving...' : 'Confirm & Resolve Case'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IncidentDetails;