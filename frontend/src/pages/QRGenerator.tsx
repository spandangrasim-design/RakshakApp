import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { pdf } from '@react-pdf/renderer';
import { Shield, Download, Plus, Loader2, MapPin, X, ZoomIn, Layers, Trash2, CheckCircle2 } from 'lucide-react';
import { generateSignedQRPayload } from '../utils/crypto';
import { QRSheetPDF, QRData } from '../components/QRSheetPDF';

interface Checkpoint {
  id: string;
  name: string;
  lat: string;
  lng: string;
}

declare global {
  interface Window {
    L?: any;
  }
}

const STORAGE_KEY = 'rakshak_checkpoints';

const QRGenerator: React.FC = () => {
  // Initialize from LocalStorage so checkpoints are not lost
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [qrData, setQrData] = useState<QRData[]>([]);

  const [cpName, setCpName] = useState('');
  const [cpId, setCpId] = useState('');
  const [cpLat, setCpLat] = useState('');
  const [cpLng, setCpLng] = useState('');

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [enlargedQR, setEnlargedQR] = useState<QRData | null>(null);

  const [mapType, setMapType] = useState<'street' | 'satellite'>('street');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const streetLayerRef = useRef<any>(null);
  const satelliteLayerRef = useRef<any>(null);

  // Sync checkpoints to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkpoints));
  }, [checkpoints]);

  // Load Leaflet dynamically
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

  // Initialize Leaflet Map
  useEffect(() => {
    if (!isMapLoaded || !mapContainerRef.current || mapInstanceRef.current || !window.L) return;

    const L = window.L;
    const initialCenter = [22.2751, 73.1560];

    const map = L.map(mapContainerRef.current).setView(initialCenter, 16);

    streetLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    satelliteLayerRef.current = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri &mdash; World Imagery',
        maxZoom: 19,
      }
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
    if (cpName && cpId && cpLat && cpLng) {
      const updated = [...checkpoints, { id: cpId, name: cpName, lat: cpLat, lng: cpLng }];
      setCheckpoints(updated);
      setQrData([]); // Reset generated state so user generates newly added codes
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

  const handleDeleteCheckpoint = (id: string) => {
    setCheckpoints(checkpoints.filter((cp) => cp.id !== id));
    setQrData(qrData.filter((q) => q.id !== id));
  };

  // Generate & Save Codes
  const generateQRCodes = async () => {
    setIsGenerating(true);
    const generated: QRData[] = [];

    for (const cp of checkpoints) {
      const payload = generateSignedQRPayload(cp.id, cp.lat, cp.lng);
      const dataUri = await QRCode.toDataURL(payload, {
        width: 600,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      generated.push({ id: cp.id, name: cp.name, lat: cp.lat, lng: cp.lng, qrDataUri: dataUri });
    }

    setQrData(generated);
    // Explicitly guarantee storage for Reports comparison
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkpoints));
    localStorage.setItem('rakshak_qr_data', JSON.stringify(generated));

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
    setIsGenerating(false);
  };

  // Download 1 QR per page PDF
  const handleDownloadPDF = async (specificQR?: QRData) => {
    setIsDownloading(true);
    try {
      const listToPrint = specificQR ? [specificQR] : qrData;
      const blob = await pdf(<QRSheetPDF checkpoints={listToPrint} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = specificQR ? `${specificQR.name}-${specificQR.id}.pdf` : 'rakshak-checkpoints-1perpage.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto text-slate-800">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Cryptographic QR Generator</h1>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg border border-emerald-200 text-sm font-medium animate-fade-in">
            <CheckCircle2 className="h-4 w-4" /> Checkpoints saved for Patrol Reports!
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-blue-600" />
              Pick Location on Map
            </label>
            <span className="text-xs text-slate-500">
              Click anywhere on the map to auto-fill Checkpoint ID, Latitude & Longitude
            </span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-50 relative">
            <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm shadow-md rounded-lg p-1 flex items-center border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => toggleMapLayer('street')}
                className={`px-3 py-1.5 rounded-md transition ${
                  mapType === 'street'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Street
              </button>
              <button
                type="button"
                onClick={() => toggleMapLayer('satellite')}
                className={`px-3 py-1.5 rounded-md transition flex items-center gap-1 ${
                  mapType === 'satellite'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Satellite
              </button>
            </div>

            {!isMapLoaded && (
              <div className="h-[380px] flex items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                Loading Map...
              </div>
            )}
            <div
              ref={mapContainerRef}
              style={{ width: '100%', height: '380px', display: isMapLoaded ? 'block' : 'none', zIndex: 0 }}
            />
          </div>
        </div>

        <form onSubmit={handleAddCheckpoint} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Checkpoint Name <span className="text-blue-600 font-bold">*</span>
            </label>
            <input
              type="text"
              value={cpName}
              onChange={(e) => setCpName(e.target.value)}
              placeholder="e.g., North Gate"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition"
              required
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Checkpoint ID <span className="text-xs text-slate-400 font-normal">(Auto-filled)</span>
            </label>
            <input
              type="text"
              value={cpId}
              onChange={(e) => setCpId(e.target.value)}
              placeholder="e.g., CP-001"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
              required
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Latitude <span className="text-xs text-slate-400 font-normal">(Auto-filled)</span>
            </label>
            <input
              type="number"
              step="any"
              value={cpLat}
              onChange={(e) => setCpLat(e.target.value)}
              placeholder="e.g., 22.2751"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
              required
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Longitude <span className="text-xs text-slate-400 font-normal">(Auto-filled)</span>
            </label>
            <input
              type="number"
              step="any"
              value={cpLng}
              onChange={(e) => setCpLng(e.target.value)}
              placeholder="e.g., 73.1560"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
              required
            />
          </div>

          <button
            type="submit"
            className="bg-slate-800 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-700 h-[42px] transition shadow-sm"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </div>

      {checkpoints.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Checkpoints ({checkpoints.length})</h2>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear all checkpoints?')) {
                  setCheckpoints([]);
                  setQrData([]);
                  localStorage.removeItem(STORAGE_KEY);
                }
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Clear All
            </button>
          </div>

          {qrData.length === 0 && (
            <div className="mb-6">
              <ul className="divide-y divide-slate-100">
                {checkpoints.map((cp) => (
                  <li key={cp.id} className="py-3 text-slate-600 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="font-medium text-slate-800">{cp.name}</span>
                      <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200">
                        {cp.id}
                      </span>
                      <span className="text-xs flex items-center gap-1 text-slate-500 font-mono">
                        <MapPin className="h-3 w-3 text-blue-500" /> {cp.lat}, {cp.lng}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteCheckpoint(cp.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {qrData.length === checkpoints.length ? (
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                {qrData.map((cp) => (
                  <div
                    key={cp.id}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col items-center bg-slate-50 relative group hover:border-blue-400 hover:shadow-md transition-all"
                  >
                    <div
                      className="relative mb-3 cursor-pointer"
                      onClick={() => setEnlargedQR(cp)}
                    >
                      <img
                        src={cp.qrDataUri}
                        alt={cp.name}
                        className="w-40 h-40 rounded-lg shadow-sm bg-white"
                      />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <ZoomIn className="text-white h-8 w-8" />
                      </div>
                    </div>
                    <span className="font-bold text-slate-800 text-center">{cp.name}</span>
                    <span className="text-xs text-slate-500 font-mono">ID: {cp.id}</span>
                    <button
                      onClick={() => handleDownloadPDF(cp)}
                      className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Download className="h-3 w-3" /> Download This PDF
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-center border-t border-slate-100 pt-6">
                <button
                  onClick={() => handleDownloadPDF()}
                  disabled={isDownloading}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg inline-flex items-center gap-2 hover:bg-blue-700 font-semibold disabled:opacity-70 shadow-sm"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Generating Multi-Page PDF...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5" /> Download Printable PDF (1 QR per page)
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={generateQRCodes}
              disabled={isGenerating}
              className="bg-emerald-600 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 hover:bg-emerald-700 font-semibold transition"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Signing & Storing...
                </>
              ) : (
                'Generate & Store Cryptographic Codes'
              )}
            </button>
          )}
        </div>
      )}

      {enlargedQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm"
          onClick={() => setEnlargedQR(null)}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-md w-full relative flex flex-col items-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setEnlargedQR(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            <h3 className="text-3xl font-bold text-slate-800 mb-2 text-center">{enlargedQR.name}</h3>
            <p className="text-slate-500 mb-6 font-medium">ID: {enlargedQR.id}</p>

            <img
              src={enlargedQR.qrDataUri}
              alt={enlargedQR.name}
              className="w-72 h-72 rounded-xl border border-slate-200 mb-6"
            />

            <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
              <MapPin className="h-5 w-5 text-blue-500" />
              <span className="font-mono text-sm">
                {enlargedQR.lat}, {enlargedQR.lng}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRGenerator;