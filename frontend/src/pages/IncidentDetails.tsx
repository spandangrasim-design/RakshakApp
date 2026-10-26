import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Paperclip,
  Send,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Users,
  UserCheck,
  Clock,
  Trash2,
  Sliders,
  FileText
} from 'lucide-react';
import { getSecureMediaUrl } from '../utils/secureMedia';

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

interface GuardUser {
  guard_id: string;
  full_name: string;
  employee_code: string;
  role?: string;
  site_location?: string;
}

interface BoundGroupMember {
  guard_id: string;
  full_name: string;
  employee_code: string;
  email: string;
}

interface Incident {
  client_incident_id: string;
  guard_id?: string;
  title?: string;
  description: string;
  priority: string;
  status: string;
  photo_url: string | null;
  reported_at: string;
  category?: string;
  assignment_group?: string;
  assigned_to?: string;
  impact?: string;
  urgency?: string;
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

const ASSIGNMENT_GROUPS = [
  'Security Operations L1',
  'Quick Response Team (QRT)',
  'Site Supervisors L2',
  'Fire & Safety Response',
];

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

export const IncidentDetails: React.FC<{ user?: any }> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [updates, setUpdates] = useState<IncidentUpdate[]>([]);
  const [guards, setGuards] = useState<GuardUser[]>([]);
  const [groupBindings, setGroupBindings] = useState<Record<string, BoundGroupMember[]>>({});
  const [defaultManagerEmail, setDefaultManagerEmail] = useState<string>('spandangrasim@gmail.com');
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'notes' | 'resolution'>('notes');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [savingGroupConfig, setSavingGroupConfig] = useState(false);

  // Case Fields
  const [callerGuardId, setCallerGuardId] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [category, setCategory] = useState('Security / Patrol');
  const [impact, setImpact] = useState('2 - Medium');
  const [urgency, setUrgency] = useState('2 - Medium');
  const [priorityLabel, setPriorityLabel] = useState('P3 - Moderate');
  const [priorityCode, setPriorityCode] = useState('P3');
  const [state, setState] = useState('Active');
  const [assignmentGroup, setAssignmentGroup] = useState('Security Operations L1');
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

  const handleImpactChange = (newImpact: string) => {
    setImpact(newImpact);
    const result = calculatePriority(newImpact, urgency);
    setPriorityLabel(result.label);
    setPriorityCode(result.code);
  };

  const handleUrgencyChange = (newUrgency: string) => {
    setUrgency(newUrgency);
    const result = calculatePriority(impact, newUrgency);
    setPriorityLabel(result.label);
    setPriorityCode(result.code);
  };

  // Initialize default group -> user bindings if none saved yet in Supabase
  const buildDefaultGroupBindings = (guardList: GuardUser[], fallbackEmail: string) => {
    const map: Record<string, BoundGroupMember[]> = {};
    ASSIGNMENT_GROUPS.forEach((gName) => (map[gName] = []));

    guardList.forEach((g, idx) => {
      const member: BoundGroupMember = {
        guard_id: g.guard_id,
        full_name: g.full_name,
        employee_code: g.employee_code,
        email: fallbackEmail,
      };
      const roleLower = (g.role || '').toLowerCase();
      if (roleLower.includes('senior') || roleLower.includes('supervisor')) {
        map['Site Supervisors L2'].push(member);
        map['Security Operations L1'].push(member);
      } else if (idx % 2 === 0) {
        map['Security Operations L1'].push(member);
        map['Quick Response Team (QRT)'].push(member);
      } else {
        map['Security Operations L1'].push(member);
        map['Fire & Safety Response'].push(member);
      }
    });

    return map;
  };

  const fetchAllDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);

      const [incRes, guardsRes, cfgRes] = await Promise.all([
        fetch(`${API_BASE_URL}/incidents/${encodeURIComponent(id)}`),
        fetch(`${API_BASE_URL}/guards`),
        fetch(`${API_BASE_URL}/admin/configs`),
      ]);

      const data = await incRes.json();
      const guardsData = await guardsRes.json();
      const cfgData = await cfgRes.json();

      const loadedGuards: GuardUser[] = guardsData.guards || [];
      setGuards(loadedGuards);

      let mgrEmail = 'spandangrasim@gmail.com';
      let savedBindings: Record<string, BoundGroupMember[]> | null = null;

      if (cfgData.success && Array.isArray(cfgData.configs)) {
        cfgData.configs.forEach((item: { key_name: string; key_value: string }) => {
          if (item.key_name === 'MANAGER_EMAIL' && item.key_value) {
            mgrEmail = item.key_value;
          }
          if (item.key_name === 'ASSIGNMENT_GROUP_BINDINGS' && item.key_value) {
            try {
              savedBindings = JSON.parse(item.key_value);
            } catch (_) {}
          }
        });
      }
      setDefaultManagerEmail(mgrEmail);

      const activeBindings = savedBindings || buildDefaultGroupBindings(loadedGuards, mgrEmail);
      setGroupBindings(activeBindings);

      let currentInc: Incident | null = null;
      let rawUpdates: IncidentUpdate[] = [];

      if (data.success && data.incident) {
        currentInc = data.incident;
        rawUpdates = data.updates || [];
      } else {
        const allRes = await fetch(`${API_BASE_URL}/incidents`);
        const allData = await allRes.json();
        const list: Incident[] = allData.incidents || [];

        currentInc =
          list.find((inc: any) => {
            const cId = (inc.client_incident_id || '').toLowerCase();
            const target = id.toLowerCase();
            if (cId === target) return true;
            if (cId && (cId.includes(target) || target.includes(cId))) return true;
            const incNum = `inc${cId.replace(/[^0-9]/g, '').padEnd(7, '0').slice(0, 7)}`;
            return incNum === target;
          }) || null;

        if (currentInc) {
          const updatesRes = await fetch(`${API_BASE_URL}/incidents/${currentInc.client_incident_id}`);
          const updatesData = await updatesRes.json();
          rawUpdates = updatesData.updates || [];
        }
      }

      if (currentInc) {
        setIncident(currentInc);
        setCallerGuardId(currentInc.guard_id || loadedGuards[0]?.guard_id || '');
        setShortDescription(currentInc.description || currentInc.title || 'Security Patrol Incident');
        setCategory(currentInc.category || 'Security / Patrol');

        const initImpact = currentInc.impact || '2 - Medium';
        const initUrgency = currentInc.urgency || '2 - Medium';
        setImpact(initImpact);
        setUrgency(initUrgency);

        const calculated = calculatePriority(initImpact, initUrgency);
        setPriorityLabel(calculated.label);
        setPriorityCode(calculated.code);

        setState(
          currentInc.status === 'RESOLVED'
            ? 'Resolved'
            : currentInc.status === 'CLOSED'
            ? 'Closed'
            : 'Active'
        );

        const grp =
          currentInc.assignment_group && ASSIGNMENT_GROUPS.includes(currentInc.assignment_group)
            ? currentInc.assignment_group
            : 'Security Operations L1';
        setAssignmentGroup(grp);
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

  // Strictly filter eligible Assignees to ONLY members bound to the selected Assignment Group
  const eligibleMembersForGroup = useMemo(() => {
    const bound = groupBindings[assignmentGroup] || [];
    if (bound.length > 0) return bound;
    return guards.map((g) => ({
      guard_id: g.guard_id,
      full_name: g.full_name,
      employee_code: g.employee_code,
      email: defaultManagerEmail,
    }));
  }, [assignmentGroup, groupBindings, guards, defaultManagerEmail]);

  // Automatically keep Assigned To valid within the selected Assignment Group
  useEffect(() => {
    if (eligibleMembersForGroup.length === 0) return;
    const isCurrentValid = eligibleMembersForGroup.some((m) => m.full_name === assignedTo);
    if (!isCurrentValid) {
      setAssignedTo(eligibleMembersForGroup[0].full_name);
    }
  }, [assignmentGroup, eligibleMembersForGroup]);

  const toggleGuardInGroup = (groupName: string, guard: GuardUser) => {
    setGroupBindings((prev) => {
      const current = prev[groupName] || [];
      const exists = current.some((m) => m.guard_id === guard.guard_id);
      const nextList = exists
        ? current.filter((m) => m.guard_id !== guard.guard_id)
        : [
            ...current,
            {
              guard_id: guard.guard_id,
              full_name: guard.full_name,
              employee_code: guard.employee_code,
              email: defaultManagerEmail,
            },
          ];
      return { ...prev, [groupName]: nextList };
    });
  };

  const updateMemberEmailInGroup = (groupName: string, guardId: string, newEmail: string) => {
    setGroupBindings((prev) => {
      const current = prev[groupName] || [];
      const nextList = current.map((m) =>
        m.guard_id === guardId ? { ...m, email: newEmail } : m
      );
      return { ...prev, [groupName]: nextList };
    });
  };

  const saveGroupBindingsToServer = async () => {
    setSavingGroupConfig(true);
    try {
      const payload = [
        {
          key_name: 'ASSIGNMENT_GROUP_BINDINGS',
          key_value: JSON.stringify(groupBindings),
        },
      ];
      await fetch(`${API_BASE_URL}/admin/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setShowGroupModal(false);
      setStatusBanner({
        type: 'ok',
        text: `Group members & emails saved! Assigning a ticket to "${assignmentGroup}" will automatically email all bound members.`,
      });
    } catch (e) {
      setStatusBanner({ type: 'err', text: 'Failed to save group bindings.' });
    } finally {
      setSavingGroupConfig(false);
    }
  };

  const handleUpdateIncident = async () => {
    if (!incident) return;
    setIsUpdating(true);
    setStatusBanner(null);

    try {
      // Ensure latest group bindings are persisted so the backend emails all bound members
      await fetch(`${API_BASE_URL}/admin/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            key_name: 'ASSIGNMENT_GROUP_BINDINGS',
            key_value: JSON.stringify(groupBindings),
          },
        ]),
      });

      const payload = {
        description: shortDescription,
        category,
        impact,
        urgency,
        priority: priorityCode,
        status: state === 'Resolved' ? 'RESOLVED' : state === 'Closed' ? 'CLOSED' : 'OPEN',
        assignment_group: assignmentGroup,
        assigned_to: assignedTo,
        guard_id: callerGuardId,
        updated_by: user?.full_name || 'SOC Command Admin',
        work_note: workNoteMessage.trim() || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/incidents/${incident.client_incident_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        if (data.activity) {
          setUpdates((prev) => [data.activity, ...prev]);
        }
        setWorkNoteMessage('');
        if (data.email_dispatched) {
          setStatusBanner({
            type: 'ok',
            text: `Case saved & automatic email dispatched to all "${assignmentGroup}" members (${(
              data.email_recipients || []
            ).join(', ')})!`,
          });
        } else {
          setStatusBanner({
            type: 'err',
            text: `Case saved, but auto-email reported: ${
              data.email_error || 'Check Gmail OAuth2 Token in API Integrations'
            }`,
          });
        }
      } else {
        setStatusBanner({ type: 'err', text: data.message || 'Failed to update case.' });
      }
    } catch (err) {
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
        headers: { 'Content-Type': 'application/json' },
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

        if (data.activity) {
          setUpdates((prev) => [data.activity, ...prev]);
        }
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
      });
      const data = await res.json();
      if (data.success) {
        navigate('/incidents');
      }
    } catch (_) {}
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
        headers: { 'Content-Type': 'application/json' },
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

  const caseDisplayCode = incident.client_incident_id
    ? `RKS-${incident.client_incident_id.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6)}`
    : 'RKS-100210';

  const initialPhotoUrl = getSecureMediaUrl(incident.photo_url);

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-xs text-slate-800 pb-12">
      {/* Rakshak SOC Command Header Bar */}
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
                <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold text-[11px]">
                  {priorityLabel}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-[11px]">
                  {state}
                </span>
              </div>
              <h1 className="text-sm font-bold text-slate-200 mt-1">
                Rakshak Security Dispatch & Assignment Console
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowGroupModal(true)}
              className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 font-bold flex items-center gap-1.5 transition"
            >
              <Users className="w-3.5 h-3.5 text-sky-400" /> Manage Group Members & Emails
            </button>

            <button
              type="button"
              onClick={handleUpdateIncident}
              disabled={isUpdating}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-bold shadow-sm transition disabled:opacity-50"
            >
              {isUpdating ? 'Saving & Emailing Group...' : 'Save & Auto-Notify Group'}
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

        {/* Modern 2-Card Dispatch Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Reporter & Threat Classification */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                1. Field Reporter & Classification
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Impact
                </label>
                <select
                  value={impact}
                  onChange={(e) => handleImpactChange(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-2.5 py-2 bg-white font-semibold outline-none"
                >
                  <option>1 - High</option>
                  <option>2 - Medium</option>
                  <option>3 - Low</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Urgency
                </label>
                <select
                  value={urgency}
                  onChange={(e) => handleUrgencyChange(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-2.5 py-2 bg-white font-semibold outline-none"
                >
                  <option>1 - High</option>
                  <option>2 - Medium</option>
                  <option>3 - Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Group Routing & Bound Responder */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  2. Group Routing & Bound Assignee
                </h2>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Auto-Email Active ({eligibleMembersForGroup.length} members)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  Computed Severity
                </label>
                <input
                  type="text"
                  disabled
                  value={priorityLabel}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold uppercase text-slate-500">
                  Assignment Group (Auto-Emails All Group Members on Save)
                </label>
                <button
                  type="button"
                  onClick={() => setShowGroupModal(true)}
                  className="text-[11px] font-bold text-blue-600 hover:underline"
                >
                  + Bind Users & Emails
                </button>
              </div>
              <select
                value={assignmentGroup}
                onChange={(e) => setAssignmentGroup(e.target.value)}
                className="w-full border border-blue-300 bg-blue-50/50 rounded-xl px-3 py-2 font-bold text-blue-950 outline-none"
              >
                {ASSIGNMENT_GROUPS.map((grp) => (
                  <option key={grp} value={grp}>
                    {grp} ({(groupBindings[grp] || []).length} members bound)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Assigned To (Filtered Strictly to "{assignmentGroup}" Members)
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full border border-emerald-300 bg-emerald-50/40 rounded-xl px-3 py-2 font-bold text-emerald-950 outline-none"
              >
                {eligibleMembersForGroup.map((m) => (
                  <option key={m.guard_id} value={m.full_name}>
                    {m.full_name} ({m.employee_code}) — {m.email}
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
              Resolution & Closure Details
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
                  placeholder="Enter instructions for the assigned response group..."
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
                  Case Audit & Auto-Email History
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

      {/* Modal: Bind Users & Email Addresses to Assignment Groups */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Bind Guards & Emails to Assignment Groups
                </h3>
                <p className="text-xs text-slate-500">
                  When an incident is assigned to a group, an email is automatically sent to every member listed in that group.
                </p>
              </div>
              <button onClick={() => setShowGroupModal(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-700" />
              </button>
            </div>

            <div className="space-y-4">
              {ASSIGNMENT_GROUPS.map((grpName) => {
                const boundList = groupBindings[grpName] || [];
                return (
                  <div key={grpName} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-900 text-sm">{grpName}</span>
                      <span className="text-xs font-bold text-blue-600">
                        {boundList.length} members bound
                      </span>
                    </div>

                    {/* Toggle Guard Buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {guards.map((g) => {
                        const isBound = boundList.some((m) => m.guard_id === g.guard_id);
                        return (
                          <button
                            key={g.guard_id}
                            type="button"
                            onClick={() => toggleGuardInGroup(grpName, g)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                              isBound
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {isBound ? '✓ ' : '+ '}
                            {g.full_name} ({g.employee_code})
                          </button>
                        );
                      })}
                    </div>

                    {/* Member Email Inputs */}
                    {boundList.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">
                          Group Member Notification Emails:
                        </div>
                        {boundList.map((member) => (
                          <div key={member.guard_id} className="flex items-center gap-2">
                            <span className="w-44 text-xs font-bold text-slate-800 truncate">
                              {member.full_name}:
                            </span>
                            <input
                              type="email"
                              value={member.email}
                              onChange={(e) =>
                                updateMemberEmailInGroup(grpName, member.guard_id, e.target.value)
                              }
                              placeholder="member@company.com"
                              className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveGroupBindingsToServer}
                disabled={savingGroupConfig}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow"
              >
                {savingGroupConfig ? 'Saving...' : 'Save Group Bindings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentDetails;