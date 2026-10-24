import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  Menu, 
  Paperclip, 
  HelpCircle, 
  Mail, 
  Activity, 
  Settings, 
  Search, 
  Info, 
  Calendar, 
  Send, 
  X,
  ChevronDown
} from 'lucide-react';
import { getSecureMediaUrl } from '../utils/secureMedia';

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

interface Incident {
  id?: string;
  client_incident_id: string;
  title?: string;
  description: string;
  priority: string;
  status: string;
  photo_url: string | null;
  reported_at: string;
  guard_id?: string;
  category?: string;
  assignment_group?: string;
  assigned_to?: string;
  contact_type?: string;
  location?: string;
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
  const [loading, setLoading] = useState(true);

  // Editable fields to mirror ServiceNow form
  const [shortDescription, setShortDescription] = useState('');
  const [category, setCategory] = useState('Security / Patrol');
  const [priority, setPriority] = useState('2 - High');
  const [state, setState] = useState('In Progress');
  const [assignmentGroup, setAssignmentGroup] = useState('Security Operations L1');
  const [assignedTo, setAssignedTo] = useState('Rahul Sharma');

  // Work note input
  const [workNoteMessage, setWorkNoteMessage] = useState('');
  const [selectedPhotoBase64, setSelectedPhotoBase64] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchIncidentDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/incidents/${id}`);
      const data = await res.json();
      
      let currentInc: Incident | null = null;
      if (data.success && data.incident) {
        currentInc = data.incident;
        setUpdates(data.updates || []);
      } else {
        const allRes = await fetch(`${API_BASE_URL}/incidents`);
        const allData = await allRes.json();
        currentInc = (allData.incidents || []).find(
          (inc: any) => inc.client_incident_id === id || inc.id === id || inc.incident_id === id
        );
        if (currentInc) {
          const updatesRes = await fetch(`${API_BASE_URL}/incidents/${currentInc.client_incident_id || currentInc.id}`);
          const updatesData = await updatesRes.json();
          setUpdates(updatesData.updates || []);
        }
      }

      if (currentInc) {
        setIncident(currentInc);
        setShortDescription(currentInc.description || currentInc.title || 'Security Patrol Incident');
        setCategory(currentInc.category || 'Security / Patrol');
        setPriority(
          currentInc.priority === 'P1' ? '1 - Critical' :
          currentInc.priority === 'P2' ? '2 - High' :
          currentInc.priority === 'P3' ? '3 - Moderate' : '4 - Low'
        );
        setState(
          currentInc.status === 'RESOLVED' ? 'Resolved' :
          currentInc.status === 'CLOSED' ? 'Closed' : 'Active'
        );
      }
    } catch (err) {
      console.error('Failed to load incident details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidentDetails();
  }, [id]);

  const handleResolveIncident = async () => {
    if (!incident) return;
    setIsResolving(true);
    try {
      const targetId = incident.client_incident_id || incident.id || id;
      const res = await fetch(`${API_BASE_URL}/incidents/${targetId}/resolve`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (data.success) {
        setIncident((prev) => prev ? { ...prev, status: 'RESOLVED' } : null);
        setState('Resolved');
        alert('Incident successfully marked as Resolved.');
      } else {
        alert(data.message || 'Could not resolve incident.');
      }
    } catch (err) {
      alert('Error updating status to Resolved.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleDeleteIncident = async () => {
    if (!incident || !window.confirm('Are you sure you want to delete this incident record?')) return;
    try {
      const targetId = incident.client_incident_id || incident.id || id;
      const res = await fetch(`${API_BASE_URL}/incidents/${targetId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        navigate('/incidents');
      } else {
        alert(data.message || 'Failed to delete record.');
      }
    } catch (e) {
      alert('Network error deleting record.');
    }
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
      const targetId = incident?.client_incident_id || incident?.id || id;
      const payload = {
        sender_type: 'admin',
        sender_name: user?.full_name || 'System Administrator',
        message: workNoteMessage.trim(),
        photo_base64: selectedPhotoBase64,
      };

      const res = await fetch(`${API_BASE_URL}/incidents/${targetId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.update) {
        setUpdates((prev) => [...prev, data.update]);
        setWorkNoteMessage('');
        setSelectedPhotoBase64(null);
        setSelectedFileName(null);
      }
    } catch (err) {
      alert('Failed to post work note.');
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#f4f5f7]">
        <div className="text-xs font-semibold text-slate-500">Loading ServiceNow Form View...</div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-8 text-center bg-[#f4f5f7] min-h-screen">
        <h2 className="text-base font-bold text-slate-700">Incident Not Found</h2>
        <button
          onClick={() => navigate('/incidents')}
          className="mt-3 rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white"
        >
          Back to Incidents
        </button>
      </div>
    );
  }

  // Display Number: INC00xxxxx based on first 7 alphanumeric chars or sequential fallback
  const incDisplayNumber = incident.client_incident_id
    ? `INC${incident.client_incident_id.replace(/[^0-9]/g, '').padEnd(7, '0').slice(0, 7)}`
    : 'INC0011211';

  const initialPhotoUrl = getSecureMediaUrl(incident.photo_url);

  return (
    <div className="min-h-screen bg-[#e6e8ea] font-sans text-xs text-[#293e40] pb-12">
      {/* Top Header Bar */}
      <div className="bg-[#e6e8ea] border-b border-[#bdc3c7] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/incidents')}
            className="p-1 border border-[#9ca3af] rounded bg-[#f3f4f6] hover:bg-white text-slate-700"
            title="Back to list"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="p-1 text-slate-700 hover:text-slate-900">
            <Menu className="w-4 h-4" />
          </button>
          <span className="font-bold text-sm text-slate-800 ml-1">
            Incident - {incDisplayNumber}
          </span>
          <Paperclip className="w-3.5 h-3.5 text-slate-500 cursor-pointer hover:text-slate-800 ml-1" />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-slate-500 mr-2">
            <HelpCircle className="w-3.5 h-3.5 cursor-pointer hover:text-slate-800" />
            <Mail className="w-3.5 h-3.5 cursor-pointer hover:text-slate-800" />
            <Activity className="w-3.5 h-3.5 cursor-pointer hover:text-slate-800" />
            <Settings className="w-3.5 h-3.5 cursor-pointer hover:text-slate-800" />
          </div>

          <button
            type="button"
            onClick={() => alert('Incident details updated.')}
            className="rounded border border-[#9ca3af] bg-white hover:bg-slate-50 px-3 py-1 font-semibold text-slate-800 shadow-sm transition"
          >
            Update
          </button>

          {state !== 'Resolved' && (
            <button
              type="button"
              onClick={handleResolveIncident}
              disabled={isResolving}
              className="rounded border border-[#1f8466] bg-[#1f8466] hover:bg-[#186a52] text-white px-3 py-1 font-semibold shadow-sm transition disabled:opacity-50"
            >
              {isResolving ? 'Resolving...' : 'Resolve Incident'}
            </button>
          )}

          <button
            type="button"
            onClick={handleDeleteIncident}
            className="rounded border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 px-3 py-1 font-semibold shadow-sm transition"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Main ServiceNow Form Layout */}
      <div className="max-w-7xl mx-auto mt-4 px-4">
        <div className="bg-white border border-[#bdc3c7] rounded-sm shadow-sm p-6 space-y-4">
          {/* Two-Column Grid of Standard ServiceNow Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
            {/* Left Column */}
            <div className="space-y-3">
              {/* Number */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Number</label>
                <div className="flex-1">
                  <input
                    type="text"
                    disabled
                    value={incDisplayNumber}
                    className="w-full bg-[#f3f4f6] border border-[#bdc3c7] rounded px-2.5 py-1 text-slate-700 font-mono font-medium outline-none"
                  />
                </div>
              </div>

              {/* Caller */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Caller</label>
                <div className="flex-1 flex items-center border border-[#bdc3c7] rounded bg-white overflow-hidden">
                  <input
                    type="text"
                    defaultValue="Rahul Sharma (Security Guard)"
                    className="w-full px-2.5 py-1 outline-none text-slate-800"
                  />
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Location</label>
                <div className="flex-1 flex items-center border border-[#bdc3c7] rounded bg-white overflow-hidden">
                  <input
                    type="text"
                    defaultValue="Birla Cellulosic Gate #2"
                    className="w-full px-2.5 py-1 outline-none text-slate-800"
                  />
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Category */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Category</label>
                <div className="flex-1">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-[#bdc3c7] rounded px-2 py-1 bg-white outline-none"
                  >
                    <option>Security / Patrol</option>
                    <option>Asset Breach</option>
                    <option>Fire / Hazard</option>
                    <option>Access Control</option>
                  </select>
                </div>
              </div>

              {/* Impact */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Impact</label>
                <div className="flex-1">
                  <select defaultValue="2 - Medium" className="w-full border border-[#bdc3c7] rounded px-2 py-1 bg-white outline-none">
                    <option>1 - High</option>
                    <option>2 - Medium</option>
                    <option>3 - Low</option>
                  </select>
                </div>
              </div>

              {/* Urgency */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Urgency</label>
                <div className="flex-1">
                  <select defaultValue="2 - Medium" className="w-full border border-[#bdc3c7] rounded px-2 py-1 bg-white outline-none">
                    <option>1 - High</option>
                    <option>2 - Medium</option>
                    <option>3 - Low</option>
                  </select>
                </div>
              </div>

              {/* Priority */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Priority</label>
                <div className="flex-1">
                  <input
                    type="text"
                    disabled
                    value={priority}
                    className="w-full bg-[#f3f4f6] border border-[#bdc3c7] rounded px-2.5 py-1 text-slate-700 font-semibold outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              {/* Opened Date */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Opened</label>
                <div className="flex-1 flex items-center border border-[#bdc3c7] rounded bg-[#f3f4f6] px-2.5 py-1">
                  <input
                    type="text"
                    disabled
                    value={new Date(incident.reported_at).toLocaleString()}
                    className="w-full bg-transparent outline-none font-mono text-slate-700"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              {/* Opened by */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Opened by</label>
                <div className="flex-1 flex items-center border border-[#bdc3c7] rounded bg-white overflow-hidden">
                  <input
                    type="text"
                    defaultValue="System Administrator"
                    className="w-full px-2.5 py-1 outline-none text-slate-800"
                  />
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Contact type */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Contact type</label>
                <div className="flex-1">
                  <select defaultValue="Mobile App / Patrol" className="w-full border border-[#bdc3c7] rounded px-2 py-1 bg-white outline-none">
                    <option>Mobile App / Patrol</option>
                    <option>Phone</option>
                    <option>Walk-in</option>
                  </select>
                </div>
              </div>

              {/* State */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">State</label>
                <div className="flex-1">
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full border border-[#bdc3c7] rounded px-2 py-1 bg-white font-semibold outline-none text-slate-800"
                  >
                    <option>Active</option>
                    <option>In Progress</option>
                    <option>Resolved</option>
                    <option>Closed</option>
                  </select>
                </div>
              </div>

              {/* Assignment group */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Assignment group</label>
                <div className="flex-1 flex items-center border border-[#bdc3c7] rounded bg-white overflow-hidden">
                  <input
                    type="text"
                    value={assignmentGroup}
                    onChange={(e) => setAssignmentGroup(e.target.value)}
                    className="w-full px-2.5 py-1 outline-none text-slate-800"
                  />
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Assigned to */}
              <div className="flex items-center">
                <label className="w-36 text-right pr-4 font-semibold text-slate-600">Assigned to</label>
                <div className="flex-1 flex items-center border border-[#bdc3c7] rounded bg-white overflow-hidden">
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-2.5 py-1 outline-none text-slate-800"
                  />
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button className="px-2 border-l border-[#bdc3c7] hover:bg-slate-100 py-1 text-slate-500">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width Short Description */}
          <div className="flex items-start pt-2 border-t border-slate-100">
            <label className="w-36 text-right pr-4 font-semibold text-slate-600 pt-1">Short description</label>
            <div className="flex-1 flex items-center border border-[#bdc3c7] rounded bg-white">
              <input
                type="text"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className="w-full px-2.5 py-1.5 outline-none font-medium text-slate-900"
              />
              <span className="px-2 text-slate-400">🔍</span>
            </div>
          </div>

          {/* Initial Guard Evidence Photo (If Uploaded) */}
          {initialPhotoUrl && (
            <div className="flex items-start pt-2 border-t border-slate-100">
              <label className="w-36 text-right pr-4 font-semibold text-slate-600 pt-1">Evidence Photo</label>
              <div className="flex-1">
                <a href={initialPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-block group">
                  <img
                    src={initialPhotoUrl}
                    alt="Guard Evidence"
                    className="max-h-48 rounded border border-slate-300 object-contain hover:shadow transition"
                  />
                  <span className="block text-[10px] text-blue-600 mt-1 underline">Click to view full image in high resolution</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Notes & Activity Stream Section (ServiceNow Tab) */}
        <div className="bg-white border border-[#bdc3c7] rounded-sm shadow-sm mt-4 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="font-bold text-sm text-slate-800">Notes & Activity Stream</span>
            <ChevronDown className="w-4 h-4 text-slate-500 cursor-pointer" />
          </div>

          {/* Additional Comments (Work Notes Input) */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-600">Work notes (Internal activity log)</label>
            
            {selectedPhotoBase64 && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded">
                <img src={selectedPhotoBase64} alt="Preview" className="h-10 w-10 object-cover rounded" />
                <span className="text-xs text-amber-800 truncate flex-1">{selectedFileName}</span>
                <button type="button" onClick={() => setSelectedPhotoBase64(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="relative">
              <textarea
                rows={3}
                value={workNoteMessage}
                onChange={(e) => setWorkNoteMessage(e.target.value)}
                placeholder="Type additional comments or dispatch instructions for the security guard..."
                className="w-full border border-[#bdc3c7] rounded bg-[#fffae6] p-2.5 outline-none focus:border-amber-400 text-slate-800 font-sans"
              />

              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
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
                    className="flex items-center gap-1 text-slate-600 hover:text-slate-900 border border-slate-300 rounded px-2.5 py-1 bg-slate-50 hover:bg-slate-100"
                  >
                    <Paperclip className="w-3.5 h-3.5" /> Attach Photo
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePostWorkNote}
                  disabled={isSending || (!workNoteMessage.trim() && !selectedPhotoBase64)}
                  className="rounded bg-[#1f8466] hover:bg-[#186a52] text-white px-4 py-1.5 font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" /> Post Work Note
                </button>
              </div>
            </div>
          </div>

          {/* Chronological Activity Feed */}
          <div className="mt-6 space-y-3 pt-4 border-t border-slate-200">
            <span className="font-bold text-slate-700 text-xs block">Activity Feed</span>

            {updates.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-200 rounded text-center text-slate-400 italic">
                No activity logs or guard responses recorded yet.
              </div>
            ) : (
              updates.map((update) => {
                const isAdmin = update.sender_type === 'admin';
                const photo = getSecureMediaUrl(update.photo_url);

                return (
                  <div key={update.id} className="border-l-2 border-slate-300 pl-3 py-1 space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-bold text-slate-800">{update.sender_name}</span>
                      <span>•</span>
                      <span>{new Date(update.created_at).toLocaleString()}</span>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded uppercase font-semibold text-slate-600">
                        {isAdmin ? 'Internal Note' : 'Guard Response'}
                      </span>
                    </div>

                    {update.message && (
                      <p className="text-slate-800 bg-[#f9fafb] p-2 rounded border border-slate-200 font-sans">
                        {update.message}
                      </p>
                    )}

                    {photo && (
                      <div className="pt-1">
                        <a href={photo} target="_blank" rel="noopener noreferrer">
                          <img
                            src={photo}
                            alt="Attachment"
                            className="max-h-40 rounded border border-slate-200 object-contain hover:shadow"
                          />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncidentDetails;