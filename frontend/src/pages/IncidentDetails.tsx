import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle, Image as ImageIcon } from 'lucide-react';

const API_BASE_URL = "https://rakshak-api.spandangrasim.workers.dev";

export default function IncidentDetails({ user }: { user: any }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<any>(null);
  const [updates, setUpdates] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchIncidentData();
  }, [id]);

  const fetchIncidentData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/incidents/${id}`);
      const data = await response.json();
      if (data.success) {
        setIncident(data.incident);
        setUpdates(data.updates);
      }
    } catch (error) {
      console.error("Failed to load ticket", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostUpdate = async () => {
    if (!newMessage.trim()) return;
    setPosting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/incidents/${id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_type: 'ADMIN',
          sender_name: user?.full_name || 'Admin',
          message: newMessage,
          photo_base64: null // Add file reader logic here if you want web admins to upload photos
        })
      });
      const data = await response.json();
      if (data.success) {
        setUpdates([...updates, data.update]);
        setNewMessage("");
      }
    } catch (error) {
      console.error("Failed to post", error);
    } finally {
      setPosting(false);
    }
  };

  const markResolved = async () => {
    await fetch(`${API_BASE_URL}/api/v1/incidents/${id}/resolve`, { method: 'PATCH' });
    fetchIncidentData();
  };

  if (loading) return <div className="p-8 text-center">Loading ticket...</div>;
  if (!incident) return <div className="p-8 text-center text-red-500">Incident not found.</div>;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6">
        
        {/* Left Column: Thread & Chat */}
        <div className="flex-grow flex flex-col h-[85vh]">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => navigate('/incidents')} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-2xl font-bold text-slate-900">{incident.title || 'Incident Record'}</h1>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl flex-grow flex flex-col overflow-hidden shadow-sm">
            {/* Timeline Area */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6 bg-slate-50">
              {/* Initial Report Bubble */}
              <div className="flex flex-col items-start max-w-[80%]">
                <span className="text-xs text-slate-500 mb-1 ml-1">Original Report • {new Date(incident.reported_at).toLocaleString()}</span>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm shadow-sm">
                  <p className="text-slate-800 text-sm mb-3">{incident.description}</p>
                  {incident.photo_url && <img src={incident.photo_url} alt="Report" className="rounded-lg max-h-64 object-cover" />}
                </div>
              </div>

              {/* Updates Thread */}
              {updates.map((update) => {
                const isAdmin = update.sender_type === 'ADMIN';
                return (
                  <div key={update.update_id} className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-slate-500 mb-1 mx-1">
                      {update.sender_name} ({update.sender_type}) • {new Date(update.created_at).toLocaleString()}
                    </span>
                    <div className={`p-4 rounded-2xl max-w-[80%] shadow-sm ${isAdmin ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                      <p className="text-sm whitespace-pre-wrap">{update.message}</p>
                      {update.photo_url && <img src={update.photo_url} alt="Update" className="rounded-lg max-h-64 object-cover mt-3" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Area */}
            {incident.status !== 'RESOLVED' && (
              <div className="p-4 bg-white border-t border-slate-200 flex gap-3 items-end">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type an update or instruction for the guard..."
                  className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none text-sm"
                  rows={2}
                />
                <button 
                  onClick={handlePostUpdate}
                  disabled={posting}
                  className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ticket Metadata */}
        <div className="w-full md:w-80 space-y-6 mt-12">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider">Ticket Details</h3>
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-slate-500 block text-xs mb-1">Status</span>
                <span className="font-semibold text-slate-900">{incident.status}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs mb-1">Priority</span>
                <span className="font-semibold text-slate-900">{incident.priority}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs mb-1">Guard ID</span>
                <span className="font-mono text-slate-700 text-xs break-all">{incident.guard_id}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs mb-1">Incident ID</span>
                <span className="font-mono text-slate-700 text-xs break-all">{incident.client_incident_id}</span>
              </div>
            </div>
            
            {incident.status !== 'RESOLVED' && (
              <button 
                onClick={markResolved}
                className="w-full mt-6 py-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Resolve Ticket
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}