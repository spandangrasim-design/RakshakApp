import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { pdf } from '@react-pdf/renderer';
import { 
  Shield, Download, Plus, Loader2, MapPin, X, ZoomIn, 
  Layers, Trash2, Edit2, Eye, CheckCircle2, Save, RefreshCw 
} from 'lucide-react';
import { generateSignedQRPayload } from '../utils/crypto';
import { QRSheetPDF, QRData } from '../components/QRSheetPDF';

// Point this to your backend domain (leave empty string '' if same origin)
const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

interface Checkpoint {
  id: string;
  name: string;
  lat: string;
  lng: string;
}

interface PatrolRound {
  id: string;
  name: string;
  created_at: string;
  checkpoints?: Checkpoint[];
}

declare global {
  interface Window {
    L?: any;
  }
}

const QRGenerator: React.FC = () => {
  const [roundName, setRoundName] = useState('');
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);

  const [currentCheckpoints, setCurrentCheckpoints] = useState<Checkpoint[]>([]);
  const [cpName, setCpName] = useState('');
  const [cpId, setCpId] = useState('');
  const [cpLat, setCpLat] = useState('');
  const [cpLng, setCpLng] = useState('');

  const [savedRounds, setSavedRounds] = useState<PatrolRound[]>([]);
  const [isLoadingRounds, setIsLoadingRounds] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapType, setMapType] = useState<'street' | 'satellite'>('street');
  const [enlargedQR, setEnlargedQR] = useState<QRData | null>(null);
  const [viewingRound, setViewingRound] = useState<PatrolRound | null>(null);
  const [viewingQRs, setViewingQRs] = useState<QRData[]>([]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const streetLayerRef = useRef<any>(null);
  const satelliteLayerRef = useRef<any>(null);

  // Fetch all rounds from Hono Backend API
  const fetchRounds = async () => {
    setIsLoadingRounds(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds`);
      const data = await res.json();
      if (data.success) {
        setSavedRounds(data.rounds || []);
      }
    } catch (err) {
      console.error('Failed to load rounds:', err);
    } finally {
      setIsLoadingRounds(false);
    }
  };

  useEffect(() => {
    fetchRounds();
  }, []);

  // Dynamically load Leaflet assets
  useEffect(() => {
    if (window.L) {
      setIsMapLoaded(true);
      return;
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => setIsMapLoaded(true);
      document.body.appendChild(script);
    } else {
      setIsMapLoaded(true);
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isMapLoaded || !mapContainerRef.current || mapInstanceRef.current || !window.L) return;

    const L = window.L;
    const initialCenter = [22.2751, 73.1560];

    const map = L.map(mapContainerRef.current).setView(initialCenter, 16);

    streetLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    });

    satelliteLayerRef.current = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
    );

    streetLayerRef.current.addTo(map);
    mapInstanceRef.current = map;

    const customPinIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `
        <div style="transform: translate(-50%, -100%);">
          <svg width="34" height="42" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.37258 0 0 5.37258 0 12C0 20.25 10.5 29.25 11.25 29.85C11.67 30.18 12.33 30.18 12.75 29.85C13.5 29.25 24 20.25 24 12C24 5.37258 18.6274 0 12 0Z" fill="#2563eb"/>
            <circle cx="12" cy="11" r="5" fill="white"/>
            <circle cx="12" cy="11" r="2.5" fill="#1d4ed8"/>
          </svg>
        </div>
      `,
      iconSize: [0, 0],
    });

    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;

      if (!markerInstanceRef.current) {
        markerInstanceRef.current = L.marker([lat, lng], { icon: customPinIcon }).addTo(map);
      } else {
        markerInstanceRef.current.setLatLng([lat, lng]);
      }

      setCpLat(lat.toFixed(6));
      setCpLng(lng.toFixed(6));

      const generatedId = `CP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      setCpId((prev) => (prev ? prev : generatedId));
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isMapLoaded]);

  const toggleMapLayer = (type: 'street' | 'satellite') => {
    if (!mapInstanceRef.current) return;
    setMapType(type);

    if (type === 'satellite') {
      mapInstanceRef.current.removeLayer(streetLayerRef.current);
      satelliteLayerRef.current.addTo(mapInstanceRef.current);
    } else {
      mapInstanceRef.current.removeLayer(satelliteLayerRef.current);
      streetLayerRef.current.addTo(mapInstanceRef.current);
    }
  };

  const handleAddCheckpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundName.trim()) {
      alert('Please enter a Round Name before adding checkpoints.');
      return;
    }
    if (cpName && cpId && cpLat && cpLng) {
      setCurrentCheckpoints([...currentCheckpoints, { id: cpId, name: cpName, lat: cpLat, lng: cpLng }]);
      setCpName('');
      setCpId('');
      setCpLat('');
      setCpLng('');

      if (markerInstanceRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(markerInstanceRef.current);
        markerInstanceRef.current = null;
      }
    }
  };

  const handleDeleteCurrentCheckpoint = (id: string) => {
    setCurrentCheckpoints(currentCheckpoints.filter((cp) => cp.id !== id));
  };

  // Save or Update Round via Backend API
  const handleSaveAndSyncRound = async () => {
    if (!roundName.trim()) {
      alert('Please enter a Round Name.');
      return;
    }
    if (currentCheckpoints.length === 0) {
      alert('Please add at least one checkpoint before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRoundId || undefined,
          name: roundName,
          checkpoints: currentCheckpoints,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Save failed');

      setStatusMessage(editingRoundId ? 'Round updated successfully!' : 'Round and Checkpoints saved successfully!');
      setTimeout(() => setStatusMessage(null), 3500);

      setRoundName('');
      setEditingRoundId(null);
      setCurrentCheckpoints([]);

      await fetchRounds();
    } catch (err: any) {
      alert(err.message || 'Failed to save round');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRound = (round: PatrolRound) => {
    setEditingRoundId(round.id);
    setRoundName(round.name);
    setCurrentCheckpoints(round.checkpoints || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRound = async (roundId: string) => {
    if (!confirm('Are you sure you want to delete this round and all its checkpoints?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/${roundId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSavedRounds(savedRounds.filter((r) => r.id !== roundId));
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    }
  };

  // Generate QR codes & open View Modal
  const handleViewRound = async (round: PatrolRound) => {
    setViewingRound(round);
    const generated: QRData[] = [];
    for (const cp of round.checkpoints || []) {
      const payload = generateSignedQRPayload(cp.id, cp.lat, cp.lng);
      const dataUri = await QRCode.toDataURL(payload, {
        width: 600,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      generated.push({ id: cp.id, name: cp.name, lat: cp.lat, lng: cp.lng, qrDataUri: dataUri });
    }
    setViewingQRs(generated);
  };

  // Download PDF (1 QR per page)
  const handleDownloadPDF = async (round: PatrolRound, specificQR?: QRData) => {
    setIsDownloading(true);
    try {
      const items = round.checkpoints || [];
      const generatedList: QRData[] = [];

      for (const cp of items) {
        if (specificQR && cp.id !== specificQR.id) continue;
        const payload = generateSignedQRPayload(cp.id, cp.lat, cp.lng);
        const dataUri = await QRCode.toDataURL(payload, {
          width: 600,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        generatedList.push({ id: cp.id, name: cp.name, lat: cp.lat, lng: cp.lng, qrDataUri: dataUri });
      }

      const blob = await pdf(<QRSheetPDF checkpoints={generatedList} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = specificQR ? `${round.name}-${specificQR.name}.pdf` : `${round.name}-1perpage.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF generation error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto text-slate-800">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Patrol Round & QR Manager</h1>
        </div>

        {statusMessage && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg border border-emerald-200 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" /> {statusMessage}
          </div>
        )}
      </div>

      {/* ROUND BUILDER CARD */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Round Name {editingRoundId && <span className="text-amber-600 text-xs">(Editing)</span>}
          </label>
          <input
            type="text"
            value={roundName}
            onChange={(e) => setRoundName(e.target.value)}
            placeholder="e.g., Night Perimeter Patrol"
            className="w-full md:w-1/2 rounded-lg border border-slate-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Map Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-blue-600" /> Pick Location on Map
            </label>
            <span className="text-xs text-slate-500">
              Click anywhere on the map to auto-fill Lat, Lng and Checkpoint ID
            </span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-50 relative">
            <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm shadow-md rounded-lg p-1 flex items-center border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => toggleMapLayer('street')}
                className={`px-3 py-1.5 rounded-md ${mapType === 'street' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Street
              </button>
              <button
                type="button"
                onClick={() => toggleMapLayer('satellite')}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1 ${mapType === 'satellite' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Layers className="h-3.5 w-3.5" /> Satellite
              </button>
            </div>

            {!isMapLoaded && (
              <div className="h-[350px] flex items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Loading Map...
              </div>
            )}
            <div ref={mapContainerRef} style={{ width: '100%', height: '350px', display: isMapLoaded ? 'block' : 'none', zIndex: 0 }} />
          </div>
        </div>

        {/* Checkpoint Input Form */}
        <form onSubmit={handleAddCheckpoint} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">Checkpoint Name *</label>
            <input
              type="text"
              value={cpName}
              onChange={(e) => setCpName(e.target.value)}
              placeholder="e.g., North Gate"
              className="w-full rounded-lg border border-slate-300 px-4 py-2"
              required
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">Checkpoint ID (Auto-filled)</label>
            <input
              type="text"
              value={cpId}
              onChange={(e) => setCpId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 bg-slate-50"
              required
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">Latitude (Auto-filled)</label>
            <input
              type="number"
              step="any"
              value={cpLat}
              onChange={(e) => setCpLat(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 bg-slate-50"
              required
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">Longitude (Auto-filled)</label>
            <input
              type="number"
              step="any"
              value={cpLng}
              onChange={(e) => setCpLng(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 bg-slate-50"
              required
            />
          </div>

          <button
            type="submit"
            className="bg-slate-800 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-700 h-[42px]"
          >
            <Plus className="h-4 w-4" /> Add Checkpoint
          </button>
        </form>

        {/* Current Round Checkpoints List */}
        {currentCheckpoints.length > 0 && (
          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-700 mb-2">Checkpoints in Current Round ({currentCheckpoints.length})</h3>
            <ul className="divide-y divide-slate-100 mb-4">
              {currentCheckpoints.map((cp) => (
                <li key={cp.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-slate-800">{cp.name}</span>
                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-xs">{cp.id}</span>
                    <span className="text-slate-500 font-mono text-xs">{cp.lat}, {cp.lng}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCurrentCheckpoint(cp.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveAndSyncRound}
                disabled={isSaving}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingRoundId ? 'Update & Sync Round' : 'Save & Sync Round'}
              </button>
              {editingRoundId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoundId(null);
                    setRoundName('');
                    setCurrentCheckpoints([]);
                  }}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SAVED ROUNDS TABLE */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800">Existing Patrol Rounds ({savedRounds.length})</h2>
          <button
            onClick={fetchRounds}
            className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingRounds ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {savedRounds.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            No rounds created yet. Enter a round name above and add checkpoints to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-3 px-4">Round Name</th>
                  <th className="py-3 px-4">Checkpoints</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {savedRounds.map((round) => (
                  <tr key={round.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-800">{round.name}</td>
                    <td className="py-3 px-4">
                      <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium">
                        {round.checkpoints?.length || 0} locations
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-xs">
                      {new Date(round.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleViewRound(round)}
                        className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md inline-flex items-center gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                      <button
                        onClick={() => handleDownloadRoundPDF(round)}
                        disabled={isDownloading}
                        className="px-2.5 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md inline-flex items-center gap-1"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </button>
                      <button
                        onClick={() => handleEditRound(round)}
                        className="px-2.5 py-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-md inline-flex items-center gap-1"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteRound(round.id)}
                        className="px-2.5 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-700 rounded-md inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* VIEW ROUND MODAL */}
      {viewingRound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" onClick={() => setViewingRound(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-2xl font-bold text-slate-800">{viewingRound.name}</h3>
                <p className="text-sm text-slate-500">{viewingRound.checkpoints?.length || 0} Checkpoints</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownloadRoundPDF(viewingRound)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" /> Download PDF (1/page)
                </button>
                <button onClick={() => setViewingRound(null)} className="p-2 text-slate-400 hover:text-slate-700">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-6">
              {viewingQRs.map((cp) => (
                <div key={cp.id} className="border border-slate-200 rounded-xl p-3 flex flex-col items-center bg-slate-50">
                  <img src={cp.qrDataUri} alt={cp.name} className="w-32 h-32 rounded bg-white mb-2" />
                  <span className="font-semibold text-slate-800 text-sm text-center">{cp.name}</span>
                  <span className="text-xs text-slate-500 font-mono">{cp.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRGenerator;