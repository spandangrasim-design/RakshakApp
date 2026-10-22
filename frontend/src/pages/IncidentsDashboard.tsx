import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, X, MessageSquare, Save } from 'lucide-react';

const API_BASE_URL = "https://rakshak-api.spandangrasim.workers.dev";

interface Incident {
  client_incident_id: string;
  guard_id: string;
  title: string;
  priority: string;
  description: string;
  photo_url: string | null;
  status: string;
  reported_at: string;
  admin_notes: string;
}

export default function IncidentsDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    fetchIncidents();
  }, []);

  const fetchIncidents = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/incidents`);
      const data = await response.json();
      if (data.success) setIncidents(data.incidents);
    } catch (error) {
      console.error("Failed to fetch incidents", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the modal when clicking resolve
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/incidents/${id}/resolve`, { method: 'PATCH' });
      const data = await response.json();
      if (data.success) {
        setIncidents(prev => prev.map(inc => inc.client_incident_id === id ? { ...inc, status: 'RESOLVED' } : inc));
        if (selectedIncident?.client_incident_id === id) {
          setSelectedIncident(prev => prev ? { ...prev, status: 'RESOLVED' } : null);
        }
      }
    } catch (error) {
      console.error("Failed to resolve incident", error);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedIncident) return;
    setSavingNotes(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/incidents/${selectedIncident.client_incident_id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesText })
      });
      const data = await response.json();
      if (data.success) {
        setIncidents(prev => prev.map(inc => inc.client_incident_id === selectedIncident.client_incident_id ? { ...inc, admin_notes: notesText } : inc));
        setSelectedIncident(prev => prev ? { ...prev, admin_notes: notesText } : null);
      }
    } catch (error) {
      console.error("Failed to save notes", error);
    } finally {
      setSavingNotes(false);
    }
  };

  const openModal = (incident: Incident) => {
    setSelectedIncident(incident);
    setNotesText(incident.admin_notes || "");
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'P1': return 'bg-red-100 text-red-800 border-red-200';
      case 'P2': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'P3': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'P4': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'RESOLVED') return <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Resolved</span>;
    if (status === 'ESCALATED') return <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Escalated</span>;
    return <span className="px-3 py-1 bg-sky-100 text-sky-700 text-xs font-bold rounded-full flex items-center gap-1"><Clock className="w-3 h-3"/> Open</span>;
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"></div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Incident Command</h1>
            <p className="text-slate-500 mt-1">Monitor live reports, update tickets, and manage SLA escalations.</p>
          </div>
          <button onClick={fetchIncidents} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all">
            Refresh Feed
          </button>
        </div>

        {/* Incident Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {incidents.map((incident) => (
            <div 
              key={incident.client_incident_id} 
              onClick={() => openModal(incident)}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
            >
              {incident.photo_url ? (
                <div className="h-48 w-full bg-slate-100 border-b border-slate-200 relative">
                  <img src={incident.photo_url} alt={incident.title || "Incident"} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-24 w-full bg-slate-50 border-b border-slate-100 flex items-center justify-center text-slate-400 text-xs">
                  No Photo Attached
                </div>
              )}

              <div className="p-5 flex-grow">
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-2.5 py-1 text-[11px] font-bold uppercase rounded-md border ${getPriorityColor(incident.priority)}`}>
                    {incident.priority}
                  </span>
                  {getStatusBadge(incident.status)}
                </div>
                
                <h3 className="text-slate-900 font-bold text-lg mb-1">{incident.title || "Untitled Incident"}</h3>
                <p className="text-slate-600 text-sm font-medium mb-4 line-clamp-2">
                  {incident.description || "No description provided."}
                </p>
                
                <div className="text-xs text-slate-500 mt-auto flex justify-between items-center border-t border-slate-100 pt-3">
                  <span>{new Date(incident.reported_at).toLocaleString()}</span>
                  {incident.admin_notes && <MessageSquare className="w-4 h-4 text-blue-500" />}
                </div>
              </div>

              {incident.status !== 'RESOLVED' && (
                <div className="p-4 border-t border-slate-100 bg-slate-50">
                  <button 
                    onClick={(e) => handleResolve(incident.client_incident_id, e)}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
                  >
                    Mark as Resolved
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Ticketing Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row">
            
            {/* Left Side: Photo & Details */}
            <div className="w-full md:w-1/2 bg-slate-50 border-r border-slate-200 overflow-y-auto">
              {selectedIncident.photo_url ? (
                <img src={selectedIncident.photo_url} alt="Incident" className="w-full h-64 object-cover" />
              ) : (
                <div className="w-full h-64 bg-slate-200 flex items-center justify-center text-slate-400">No Photo</div>
              )}
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`px-2.5 py-1 text-[11px] font-bold uppercase rounded-md border ${getPriorityColor(selectedIncident.priority)}`}>
                    {selectedIncident.priority}
                  </span>
                  {getStatusBadge(selectedIncident.status)}
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">{selectedIncident.title || "Untitled Incident"}</h2>
                <p className="text-slate-700 text-sm mb-6">{selectedIncident.description}</p>
                
                <div className="space-y-2 text-sm text-slate-500 border-t border-slate-200 pt-4">
                  <p><strong>Reported:</strong> {new Date(selectedIncident.reported_at).toLocaleString()}</p>
                  <p><strong>Incident ID:</strong> <span className="font-mono text-xs">{selectedIncident.client_incident_id}</span></p>
                  <p><strong>Guard ID:</strong> <span className="font-mono text-xs">{selectedIncident.guard_id}</span></p>
                </div>
              </div>
            </div>

            {/* Right Side: Ticketing & Notes */}
            <div className="w-full md:w-1/2 flex flex-col bg-white h-[50vh] md:h-auto">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" /> Admin Notes
                </h3>
                <button onClick={() => setSelectedIncident(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              
              <div className="p-6 flex-grow flex flex-col">
                <label className="text-sm font-semibold text-slate-700 mb-2">Investigation Updates & Comments</label>
                <textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Add resolution details, investigation notes, or instructions here..."
                  className="w-full flex-grow p-4 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none resize-none text-sm text-slate-800"
                ></textarea>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
                <button 
                  onClick={() => setSelectedIncident(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-medium rounded-lg text-sm hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="px-6 py-2 bg-blue-900 hover:bg-blue-800 text-white font-medium rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {savingNotes ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                  Save Notes
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}