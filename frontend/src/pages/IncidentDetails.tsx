import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, X, CheckCircle, AlertTriangle, Clock, Image as ImageIcon } from 'lucide-react';
import { getSecureMediaUrl } from '../utils/secureMedia';

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

interface Incident {
  client_incident_id: string;
  description: string;
  priority: string;
  status: string;
  photo_url: string | null;
  reported_at: string;
  guard_id: string;
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

interface IncidentDetailsProps {
  user: any;
}

export const IncidentDetails: React.FC<IncidentDetailsProps> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [updates, setUpdates] = useState<IncidentUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const [replyMessage, setReplyMessage] = useState('');
  const [selectedPhotoBase64, setSelectedPhotoBase64] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchIncidentDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/incidents/${id}`);
      const data = await res.json();
      
      if (data.success && data.incident) {
        setIncident(data.incident);
        setUpdates(data.updates || []);
      } else {
        // Fallback: Fetch all incidents to find a matching ID or client_incident_id
        const allRes = await fetch(`${API_BASE_URL}/incidents`);
        const allData = await allRes.json();
        const found = (allData.incidents || []).find(
          (inc: any) => inc.client_incident_id === id || inc.id === id || inc.incident_id === id
        );

        if (found) {
          setIncident(found);
          const updatesRes = await fetch(`${API_BASE_URL}/incidents/${found.client_incident_id || found.id}`);
          const updatesData = await updatesRes.json();
          setUpdates(updatesData.updates || []);
        } else {
          setIncident(null);
        }
      }
    } catch (err) {
      console.error('Failed to load incident details:', err);
      setIncident(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidentDetails();
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [updates]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, or JPEG).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be smaller than 5MB.');
      return;
    }

    setSelectedFileName(file.name);

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedPhotoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setSelectedPhotoBase64(null);
    setSelectedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || (!replyMessage.trim() && !selectedPhotoBase64)) return;

    setIsSending(true);

    try {
      const payload = {
        sender_type: 'admin',
        sender_name: user?.full_name || 'Admin Operations',
        message: replyMessage.trim(),
        photo_base64: selectedPhotoBase64,
      };

      const targetId = incident?.client_incident_id || id;
      const res = await fetch(`${API_BASE_URL}/incidents/${targetId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.update) {
        setUpdates((prev) => [...prev, data.update]);
        setReplyMessage('');
        handleRemovePhoto();
      } else {
        alert(data.message || 'Failed to send update.');
      }
    } catch (err) {
      alert('Network error while posting update.');
    } finally {
      setIsSending(false);
    }
  };

  const handleResolveIncident = async () => {
    if (!id || !window.confirm('Are you sure you want to resolve this ticket?')) return;

    setIsResolving(true);
    try {
      const targetId = incident?.client_incident_id || id;
      const res = await fetch(`${API_BASE_URL}/incidents/${targetId}/resolve`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (data.success) {
        setIncident((prev) => (prev ? { ...prev, status: 'RESOLVED' } : null));
      }
    } catch (err) {
      alert('Failed to resolve incident.');
    } finally {
      setIsResolving(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'P1':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'P2':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'P3':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm font-medium text-slate-500">Loading incident command room...</div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="mx-auto max-w-4xl p-8 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-rose-500" />
        <h2 className="mt-4 text-xl font-bold text-slate-800">Incident Not Found</h2>
        <button
          onClick={() => navigate('/incidents')}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Back to Incidents
        </button>
      </div>
    );
  }

  const initialPhotoUrl = getSecureMediaUrl(incident.photo_url);

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/incidents')}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${getPriorityBadge(incident.priority)}`}>
                {incident.priority}
              </span>
              <h1 className="text-xl font-bold text-slate-900 font-mono">
                #{incident.client_incident_id ? incident.client_incident_id.substring(0, 8) : 'Incident'}
              </h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  incident.status === 'RESOLVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : incident.status === 'ESCALATED'
                    ? 'bg-rose-100 text-rose-800 animate-pulse'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {incident.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Reported on {new Date(incident.reported_at).toLocaleString()}
            </p>
          </div>
        </div>

        {incident.status !== 'RESOLVED' && (
          <button
            onClick={handleResolveIncident}
            disabled={isResolving}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            <span>{isResolving ? 'Resolving...' : 'Mark as Resolved'}</span>
          </button>
        )}
      </div>

      {/* Main Incident Details Box */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Initial Guard Report</div>
        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{incident.description}</p>

        {initialPhotoUrl && (
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Initial Photo Evidence:
            </p>
            <a href={initialPhotoUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={initialPhotoUrl}
                alt="Incident Evidence"
                className="max-h-64 rounded-lg border border-slate-200 object-cover hover:opacity-95 transition"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </a>
          </div>
        )}
      </div>

      {/* Threaded Activity / Chat */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          Incident Command Timeline ({updates.length} {updates.length === 1 ? 'update' : 'updates'})
        </h3>

        <div className="space-y-3">
          {updates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
              No replies or status updates posted yet.
            </div>
          ) : (
            updates.map((update) => {
              const isAdmin = update.sender_type === 'admin';
              const updatePhotoUrl = getSecureMediaUrl(update.photo_url);

              return (
                <div
                  key={update.id}
                  className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-2xl rounded-2xl p-4 text-sm shadow-sm space-y-2 ${
                      isAdmin
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-[11px] opacity-80">
                      <span className="font-semibold">{update.sender_name}</span>
                      <span>{new Date(update.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {update.message && <p className="whitespace-pre-wrap leading-relaxed">{update.message}</p>}

                    {updatePhotoUrl && (
                      <div className="pt-1">
                        <a href={updatePhotoUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={updatePhotoUrl}
                            alt="Attachment"
                            className="max-h-56 rounded-lg border border-white/20 object-cover hover:opacity-95 transition"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Reply Input Bar with Photo Picker */}
      <div className="sticky bottom-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        {selectedPhotoBase64 && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <img
              src={selectedPhotoBase64}
              alt="Attachment Preview"
              className="h-14 w-14 rounded object-cover border border-slate-300"
            />
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-xs font-medium text-slate-700">{selectedFileName}</p>
              <p className="text-[10px] text-slate-400">Ready to upload to Cloudflare R2</p>
            </div>
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSendReply} className="flex items-end gap-2">
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
            className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
            title="Attach photo"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          <textarea
            rows={1}
            value={replyMessage}
            onChange={(e) => setReplyMessage(e.target.value)}
            placeholder="Type your response to the patrol guard..."
            className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendReply(e);
              }
            }}
          />

          <button
            type="submit"
            disabled={isSending || (!replyMessage.trim() && !selectedPhotoBase64)}
            className="flex items-center justify-center rounded-xl bg-blue-600 p-2.5 text-white hover:bg-blue-700 transition disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default IncidentDetails;