import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Clock, MessageSquare } from 'lucide-react';

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
  const navigate = useNavigate();

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
    e.stopPropagation(); // Prevent redirecting when clicking resolve
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/incidents/${id}/resolve`, { method: 'PATCH' });
      const data = await response.json();
      if (data.success) {
        setIncidents(prev => prev.map(inc => inc.client_incident_id === id ? { ...inc, status: 'RESOLVED' } : inc));
      }
    } catch (error) {
      console.error("Failed to resolve incident", error);
    }
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
              onClick={() => navigate(`/incidents/${incident.client_incident_id}`)}
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
                  <MessageSquare className="w-4 h-4 text-blue-500" />
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
          
          {incidents.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl">
              No incidents reported yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}