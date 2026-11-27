import { API_ROOT } from '../lib/api';
import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import QRCode from 'qrcode';
import {
  Shield, Download, Plus, Loader2, MapPin, X,
  Layers, Trash2, Edit2, Eye, CheckCircle2, Save, RefreshCw,
  ChevronLeft, ChevronRight, Search, Clock
} from 'lucide-react';
import type { QRData } from '../components/QRSheetPDF';

// Point this to your backend domain (leave empty string '' if same origin)
const API_BASE = API_ROOT;

interface Checkpoint {
  id: string;
  name: string;
  lat: string;
  lng: string;
  qr_payload?: string | null;
  sequence_order?: number;
}

interface SearchResult {
  place_id: string | number;
  display_name: string;
  lat: string;
  lon: string;
}

const buildQrPayload = async (cp: Checkpoint): Promise<string> => {
  const parts = String(cp.qr_payload || '').split('|');
  if (parts.length >= 4 && parts[0] === cp.id && parts[3]) {
    return `rakshak://cp?id=${cp.id}&lat=${cp.lat}&lng=${cp.lng}&s=${parts[3]}`;
  }
  const token = localStorage.getItem('token') || '';
  const res = await fetch(`${API_BASE}/api/v1/checkpoints/${cp.id}/qr`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Could not sign QR code');
  return data.payload as string;
};

interface PatrolRound {
  id: string;
  name: string;
  created_at: string;
  checkpoints?: Checkpoint[];
  renew_every_minutes?: number | null;
  renewed_at?: string | null;
}

const REPEAT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Daily (midnight)' },
  { value: '60', label: 'Every 1 hour' },
  { value: '120', label: 'Every 2 hours' },
  { value: '180', label: 'Every 3 hours' },
  { value: '240', label: 'Every 4 hours' },
  { value: '360', label: 'Every 6 hours' },
  { value: '480', label: 'Every 8 hours' },
  { value: '720', label: 'Every 12 hours' },
];

declare global {
  interface Window {
    L?: any;
  }
}

const createSelectedPinIcon = (leaflet: any) =>
  leaflet.divIcon({
    className: 'rakshak-selected-pin',
    html: `
      <div style="width:34px;height:42px;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.45));">
        <svg width="34" height="42" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37258 0 0 5.37258 0 12C0 20.25 10.5 29.25 11.25 29.85C11.67 30.18 12.33 30.18 12.75 29.85C13.5 29.25 24 20.25 24 12C24 5.37258 18.6274 0 12 0Z" fill="#dc2626"/>
          <circle cx="12" cy="11" r="5" fill="#ffffff"/>
          <circle cx="12" cy="11" r="2.5" fill="#dc2626"/>
        </svg>
      </div>
    `,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
  });

const createNumberedStopIcon = (leaflet: any, num: number) =>
  leaflet.divIcon({
    className: 'rakshak-stop-pin',
    html: `
      <div style="width:28px;height:28px;border-radius:9999px;background:#0f172a;color:#ffffff;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;font-family:monospace;">
        ${num}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

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
  const [viewingRound, setViewingRound] = useState<PatrolRound | null>(null);
  const [viewingQRs, setViewingQRs] = useState<QRData[]>([]);

  // Location Search Bar State
  const [locationQuery, setLocationQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const stopMarkersRef = useRef<any[]>([]);
  const streetLayerRef = useRef<any>(null);
  const satelliteLayerRef = useRef<any>(null);

  const placeSelectionMarker = (lat: number, lng: number, panTo = false) => {
    const map = mapInstanceRef.current;
    const leaflet = window.L || L;
    if (!map || !leaflet) return;

    const icon = createSelectedPinIcon(leaflet);
    if (!markerInstanceRef.current) {
      const m = leaflet.marker([lat, lng], { icon, draggable: true }).addTo(map);
      m.on('dragend', () => {
        const pos = m.getLatLng();
        setCpLat(pos.lat.toFixed(6));
        setCpLng(pos.lng.toFixed(6));
      });
      markerInstanceRef.current = m;
    } else {
      markerInstanceRef.current.setLatLng([lat, lng]);
    }

    if (panTo) {
      map.setView([lat, lng], Math.max(map.getZoom(), 17));
    }

    setCpLat(lat.toFixed(6));
    setCpLng(lng.toFixed(6));
    const generatedId = `CP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    setCpId((prev) => (prev ? prev : generatedId));
  };

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

  useEffect(() => {
    window.L = window.L || L;
    setIsMapLoaded(true);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isMapLoaded || !mapContainerRef.current || mapInstanceRef.current || !window.L) return;

    const leaflet = window.L;
    const initialCenter = [22.2751, 73.1560];

    const map = leaflet.map(mapContainerRef.current).setView(initialCenter, 16);

    streetLayerRef.current = leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    });

    satelliteLayerRef.current = leaflet.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
    );

    streetLayerRef.current.addTo(map);
    mapInstanceRef.current = map;

    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      placeSelectionMarker(lat, lng, false);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
      stopMarkersRef.current = [];
    };
  }, [isMapLoaded]);

  // Render numbered stop markers for all checkpoints currently in the circuit
  useEffect(() => {
    const map = mapInstanceRef.current;
    const leaflet = window.L || L;
    if (!map || !leaflet) return;

    stopMarkersRef.current.forEach((m) => map.removeLayer(m));
    stopMarkersRef.current = [];

    currentCheckpoints.forEach((cp, idx) => {
      const lat = parseFloat(cp.lat);
      const lng = parseFloat(cp.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const m = leaflet
          .marker([lat, lng], { icon: createNumberedStopIcon(leaflet, idx + 1) })
          .bindTooltip(`${idx + 1}. ${cp.name}`, { direction: 'top', offset: [0, -14] })
          .addTo(map);
        stopMarkersRef.current.push(m);
      }
    });
  }, [currentCheckpoints, isMapLoaded]);

  // Location search: bias results towards Gujarat, India. Explicit state/country
  // terms supplied by the user are preserved.
  const handleLocationSearch = async () => {
    const q = locationQuery.trim().replace(/\s+/g, ' ');
    if (!q) return;

    setIsSearchingLocation(true);
    setSearchError(null);
    setSearchResults([]);

    const gujaratContext = /gujarat|india/i.test(q)
      ? q
      : `${q}, Gujarat, India`;

    const toSearchResult = (item: any, index: number): SearchResult | null => {
      const lat = item?.lat ?? item?.geometry?.coordinates?.[1];
      const lon = item?.lon ?? item?.geometry?.coordinates?.[0];
      const displayName = item?.display_name || [
        item?.properties?.name,
        item?.properties?.street,
        item?.properties?.district || item?.properties?.city,
        item?.properties?.state,
        item?.properties?.country,
      ].filter(Boolean).join(', ');

      if (lat == null || lon == null || !displayName) return null;
      return {
        place_id: item?.place_id ?? item?.properties?.osm_id ?? `${lat}-${lon}-${index}`,
        display_name: displayName,
        lat: String(lat),
        lon: String(lon),
      };
    };

    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        q: gujaratContext,
        limit: '10',
        countrycodes: 'in',
        addressdetails: '1',
        namedetails: '1',
        'accept-language': 'en',
        // Gujarat-wide Nominatim viewbox order: west, north, east, south.
        viewbox: '68.0,24.7,74.5,20.0',
        bounded: '0',
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`OpenStreetMap search returned ${response.status}`);
      const nominatimData = await response.json();
      let results: SearchResult[] = Array.isArray(nominatimData)
        ? nominatimData.map(toSearchResult).filter(Boolean) as SearchResult[]
        : [];

      // Photon provides a second OpenStreetMap-backed index and often finds
      // named buildings/POIs that Nominatim does not return for the same text.
      if (results.length === 0) {
        const photonParams = new URLSearchParams({
          q: gujaratContext,
          limit: '10',
          // Approximate geographic centre of Gujarat for result ranking.
          lat: '22.5',
          lon: '71.5',
          lang: 'en',
        });
        const photonResponse = await fetch(`https://photon.komoot.io/api/?${photonParams.toString()}`, {
          headers: { Accept: 'application/geo+json' },
        });
        if (photonResponse.ok) {
          const photonData = await photonResponse.json();
          results = (photonData?.features || [])
            .map(toSearchResult)
            .filter(Boolean) as SearchResult[];
        }
      }

      // If the Gujarat-biased lookup finds nothing, try the original phrase
      // as a fallback while retaining the India country restriction.
      if (results.length === 0 && gujaratContext !== q) {
        const fallbackParams = new URLSearchParams({
          format: 'jsonv2', q, limit: '10', countrycodes: 'in', addressdetails: '1',
          'accept-language': 'en', viewbox: '68.0,24.7,74.5,20.0', bounded: '0',
        });
        const fallbackResponse = await fetch(`https://nominatim.openstreetmap.org/search?${fallbackParams.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          results = Array.isArray(fallbackData)
            ? fallbackData.map(toSearchResult).filter(Boolean) as SearchResult[]
            : [];
        }
      }

      const uniqueResults = Array.from(
        new Map(results.map((item) => [`${Number(item.lat).toFixed(5)},${Number(item.lon).toFixed(5)}`, item])).values()
      );

      if (uniqueResults.length === 0) {
        setSearchError('No matching place was found in OpenStreetMap. Try the full building name, nearby road/area, or drop the pin directly on the map.');
      } else {
        setSearchResults(uniqueResults);
      }
    } catch (error) {
      console.error('Location search failed:', error);
      setSearchError('Location search service is unavailable. Check your connection or place the pin directly on the map.');
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const handleSelectSearchResult = (item: SearchResult) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      placeSelectionMarker(lat, lng, true);
    }
    setSearchResults([]);
    setLocationQuery(item.display_name);
  };

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
    setRouteWorkspace('builder');
    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- renewal: automatic repeat + on-demand "renew now" ----
  const [renewBusy, setRenewBusy] = useState<string | null>(null);

  const changeRepeat = async (roundId: string, value: string) => {
    setSavedRounds((prev) => prev.map((r) => (r.id === roundId ? { ...r, renew_every_minutes: value ? Number(value) : null } : r)));
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/${roundId}/renewal`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renew_every_minutes: value ? Number(value) : null }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      alert('Repeat saved.');
    } catch (e: any) {
      alert(e.message || 'Could not save the repeat setting.');
      fetchRounds();
    }
  };

  const renewNow = async (round: PatrolRound) => {
    if (!confirm(`Renew "${round.name}" now? It becomes available again for the next guard, and progress so far is cleared.`)) return;
    setRenewBusy(round.id);
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/${round.id}/renew`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      alert(`"${round.name}" renewed. It is ready for a new guard.`);
      fetchRounds();
    } catch (e: any) {
      alert(e.message || 'Could not renew the route.');
    } finally {
      setRenewBusy(null);
    }
  };

  const renewAll = async () => {
    if (!confirm('Renew ALL routes now? Every route starts a fresh round and progress so far is cleared.')) return;
    setRenewBusy('ALL');
    try {
      const res = await fetch(`${API_BASE}/api/v1/rounds/renew-all`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      alert('All routes renewed. They are ready for new guards.');
      fetchRounds();
    } catch (e: any) {
      alert(e.message || 'Could not renew the routes.');
    } finally {
      setRenewBusy(null);
    }
  };

  const canGuestEnroll = (() => { try { return JSON.parse(localStorage.getItem('visible_modules') || '{}').guest_enrollment === true; } catch { return false; } })();
  const [renewOnJoin, setRenewOnJoin] = useState(false);
  useEffect(() => {
    if (!canGuestEnroll) return;
    fetch(`${API_BASE}/api/v1/admin/configs`).then((r) => r.json()).then((d) => {
      const row = (d.configs || []).find((x: any) => x.key_name === 'RENEW_ON_NEW_GUARD');
      setRenewOnJoin(row?.key_value === 'true');
    }).catch(() => {});
  }, [canGuestEnroll]);

  const toggleRenewOnJoin = async () => {
    const next = !renewOnJoin;
    setRenewOnJoin(next);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/configs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ key_name: 'RENEW_ON_NEW_GUARD', key_value: next ? 'true' : 'false' }]),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      alert(next ? 'Routes will renew automatically when a new guard joins.' : 'Automatic renewal on join is off.');
    } catch (e: any) {
      setRenewOnJoin(!next);
      alert(e.message || 'Could not save the setting.');
    }
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

  const handleViewRound = async (round: PatrolRound) => {
    setViewingRound(round);
    const generated: QRData[] = [];
    for (const cp of round.checkpoints || []) {
      const payload = await buildQrPayload(cp);
      const dataUri = await QRCode.toDataURL(payload, {
        width: 600,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      generated.push({ id: cp.id, name: cp.name, lat: cp.lat, lng: cp.lng, qrDataUri: dataUri });
    }
    setViewingQRs(generated);
  };

  const handleDownloadRoundPDF = async (round: PatrolRound, specificQR?: QRData) => {
    setIsDownloading(true);
    try {
      const items = round.checkpoints || [];
      const generatedList: QRData[] = [];

      for (const cp of items) {
        if (specificQR && cp.id !== specificQR.id) continue;
        const payload = await buildQrPayload(cp);
        const dataUri = await QRCode.toDataURL(payload, {
          width: 600,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        generatedList.push({ id: cp.id, name: cp.name, lat: cp.lat, lng: cp.lng, qrDataUri: dataUri });
      }

      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      const customBrand = JSON.parse(localStorage.getItem('active_tenant_branding') || 'null');
      const brandLogo = customBrand?.logo_url || storedUser.tenant_logo_url || null;
      const brandName = customBrand?.name || storedUser.tenant_name || round.name || 'Industrial Facility';
      const brandAddress = customBrand?.address || storedUser.tenant_address || '';
      const defaultSpandanLogo = window.location.origin + '/branding/spandan-it-logo.png';
      const spandanLogo = customBrand?.spandan_logo_url || defaultSpandanLogo;

      const [{ pdf }, { QRSheetPDF }] = await Promise.all([import('@react-pdf/renderer'), import('../components/QRSheetPDF')]);
      const blob = await pdf(
        <QRSheetPDF
          checkpoints={generatedList}
          industryName={brandName}
          industryAddress={brandAddress}
          industryLogoUrl={brandLogo}
          spandanLogoUrl={spandanLogo}
        />
      ).toBlob();
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

  const [routeWorkspace, setRouteWorkspace] = useState<'routes' | 'builder'>('routes');
  const [routeSearch, setRouteSearch] = useState<string>('');
  const [repeatFilter, setRepeatFilter] = useState<'ALL' | 'DAILY' | 'HOURLY'>('ALL');
  const [routePage, setRoutePage] = useState<number>(1);
  const [routePageSize, setRoutePageSize] = useState<number>(20);

  const totalCheckpointsCount = savedRounds.reduce((acc, r) => acc + (r.checkpoints?.length || 0), 0);
  const hourlyRoutesCount = savedRounds.filter((r) => !!r.renew_every_minutes).length;

  const filteredRounds = savedRounds.filter((r) => {
    if (repeatFilter === 'DAILY' && r.renew_every_minutes) return false;
    if (repeatFilter === 'HOURLY' && !r.renew_every_minutes) return false;
    if (routeSearch.trim()) {
      const q = routeSearch.trim().toLowerCase();
      const cpNames = (r.checkpoints || []).map((c) => `${c.name} ${c.id}`).join(' ').toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !cpNames.includes(q)) return false;
    }
    return true;
  });

  const totalRouteRecords = filteredRounds.length;
  const totalRoutePages = Math.max(1, Math.ceil(totalRouteRecords / routePageSize));
  const safeRoutePage = Math.min(routePage, totalRoutePages);
  const paginatedRounds = filteredRounds.slice((safeRoutePage - 1) * routePageSize, safeRoutePage * routePageSize);

  const routePageNumbers: (number | 'ellipsis')[] = [];
  if (totalRoutePages <= 7) {
    for (let i = 1; i <= totalRoutePages; i++) routePageNumbers.push(i);
  } else {
    routePageNumbers.push(1);
    if (safeRoutePage > 3) routePageNumbers.push('ellipsis');
    const start = Math.max(2, safeRoutePage - 1);
    const end = Math.min(totalRoutePages - 1, safeRoutePage + 1);
    for (let i = start; i <= end; i++) routePageNumbers.push(i);
    if (safeRoutePage < totalRoutePages - 2) routePageNumbers.push('ellipsis');
    routePageNumbers.push(totalRoutePages);
  }

  const routeStartItem = totalRouteRecords === 0 ? 0 : (safeRoutePage - 1) * routePageSize + 1;
  const routeEndItem = Math.min(totalRouteRecords, safeRoutePage * routePageSize);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 font-sans text-xs text-slate-800">
      <div className="mx-auto max-w-[1600px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Patrol Routes &amp; QR Checkpoints
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Manage active patrol circuits, auto-renewal schedules, printable QR sheets, and GPS checkpoint coordinates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {statusMessage && (
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> {statusMessage}
              </div>
            )}

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Layers className="h-3.5 w-3.5 text-brand-600" />
              <span className="text-[11px] font-bold uppercase text-slate-400">Workspace:</span>
              <select
                value={routeWorkspace}
                onChange={(e) => {
                  const val = e.target.value as 'routes' | 'builder';
                  setRouteWorkspace(val);
                  if (val === 'builder') {
                    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
                  }
                }}
                className="bg-transparent text-xs font-extrabold text-slate-900 outline-none"
              >
                <option value="routes">Saved Routes &amp; QR Sheets ({savedRounds.length})</option>
                <option value="builder">{editingRoundId ? 'Edit Route & Map Pins' : '+ Create New Route & Pins'}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={renewAll}
              disabled={renewBusy !== null || savedRounds.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
              title="Start a fresh round on every route"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${renewBusy === 'ALL' ? 'animate-spin' : ''}`} />
              Renew All Routes
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingRoundId(null);
                setRoundName('');
                setCurrentCheckpoints([]);
                setRouteWorkspace('builder');
                setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              New Patrol Route
            </button>
          </div>
        </div>

        {/* 4-Card Summary KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              setRouteWorkspace('routes');
              setRepeatFilter('ALL');
              setRoutePage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              routeWorkspace === 'routes' && repeatFilter === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold uppercase ${routeWorkspace === 'routes' && repeatFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Patrol Routes
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold">{savedRounds.length}</div>
            </div>
            <Shield className={`h-5 w-5 ${routeWorkspace === 'routes' && repeatFilter === 'ALL' ? 'text-sky-400' : 'text-slate-400'}`} />
          </button>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <div className="text-[11px] font-bold uppercase text-blue-700">Total QR Checkpoints</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{totalCheckpointsCount}</div>
            </div>
            <MapPin className="h-5 w-5 text-blue-600" />
          </div>

          <button
            type="button"
            onClick={() => {
              setRouteWorkspace('routes');
              setRepeatFilter('HOURLY');
              setRoutePage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              routeWorkspace === 'routes' && repeatFilter === 'HOURLY'
                ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-emerald-700">Auto-Repeating Routes</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{hourlyRoutesCount}</div>
            </div>
            <Clock className="h-5 w-5 text-emerald-600" />
          </button>

          <button
            type="button"
            onClick={() => {
              setRouteWorkspace('builder');
              setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              routeWorkspace === 'builder'
                ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-indigo-700">Draft Checkpoints</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{currentCheckpoints.length}</div>
            </div>
            <Plus className="h-5 w-5 text-indigo-600" />
          </button>
        </div>

        {/* ROUTE BUILDER CARD */}
        <div className={routeWorkspace === 'builder' ? 'rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5' : 'hidden'}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                {editingRoundId ? `Editing Route: ${roundName}` : 'Create New Patrol Route & GPS Checkpoints'}
              </h2>
              <p className="text-xs text-slate-500">
                Search for a location or click anywhere on the map to drop a visible marker pin and auto-populate coordinates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRouteWorkspace('routes')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              ← Back to Saved Routes
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              Route / Circuit Name *
            </label>
            <input
              type="text"
              value={roundName}
              onChange={(e) => setRoundName(e.target.value)}
              placeholder="e.g., Night Perimeter Patrol"
              className="w-full md:w-1/2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand-500"
            />
          </div>

          {/* Map Section with Location Search Bar */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-rose-600" /> Pick Checkpoint Location on Map
              </label>
              <span className="text-[11px] text-slate-400">
                Search a place or click/drag the red pin to auto-fill Lat, Lng &amp; Checkpoint ID
              </span>
            </div>

            {/* Location Search Bar */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      if (!e.target.value.trim()) {
                        setSearchResults([]);
                        setSearchError(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLocationSearch();
                      }
                    }}
                    placeholder="Search location, plant, gate, street, or city..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 focus:bg-white"
                  />
                  {locationQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocationQuery('');
                        setSearchResults([]);
                        setSearchError(null);
                      }}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleLocationSearch}
                  disabled={isSearchingLocation || !locationQuery.trim()}
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSearchingLocation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Search
                </button>
              </div>

              {searchError && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">{searchError}</p>
              )}

              {searchResults.length > 0 && (
                <ul className="absolute left-0 right-0 top-[40px] z-[1100] max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
                  {searchResults.map((item) => (
                    <li key={item.place_id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSearchResult(item)}
                        className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                      >
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                        <span className="line-clamp-2 font-medium">{item.display_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
              <div className="absolute top-3 right-3 z-[1000] flex items-center rounded-xl border border-slate-200 bg-white/95 p-1 text-xs font-bold shadow-md backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => toggleMapLayer('street')}
                  className={`rounded-lg px-3 py-1 ${mapType === 'street' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Street
                </button>
                <button
                  type="button"
                  onClick={() => toggleMapLayer('satellite')}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1 ${mapType === 'satellite' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <Layers className="h-3.5 w-3.5" /> Satellite
                </button>
              </div>

              {!isMapLoaded && (
                <div className="flex h-[360px] items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> Loading Map...
                </div>
              )}
              <div ref={mapContainerRef} style={{ width: '100%', height: '360px', display: isMapLoaded ? 'block' : 'none', zIndex: 0 }} />
            </div>
          </div>

          {/* Checkpoint Input Form */}
          <form onSubmit={handleAddCheckpoint} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-bold text-slate-600">Checkpoint Name *</label>
              <input
                type="text"
                value={cpName}
                onChange={(e) => setCpName(e.target.value)}
                placeholder="e.g., North Gate"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs outline-none focus:border-brand-500"
                required
              />
            </div>

            <div className="min-w-[150px] flex-1">
              <label className="mb-1 block text-xs font-bold text-slate-600">Checkpoint ID</label>
              <input
                type="text"
                value={cpId}
                onChange={(e) => setCpId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs outline-none"
                required
              />
            </div>

            <div className="min-w-[150px] flex-1">
              <label className="mb-1 block text-xs font-bold text-slate-600">Latitude</label>
              <input
                type="number"
                step="any"
                value={cpLat}
                onChange={(e) => setCpLat(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs outline-none"
                required
              />
            </div>

            <div className="min-w-[150px] flex-1">
              <label className="mb-1 block text-xs font-bold text-slate-600">Longitude</label>
              <input
                type="number"
                step="any"
                value={cpLng}
                onChange={(e) => setCpLng(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs outline-none"
                required
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-[36px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" /> Add Stop
            </button>
          </form>

          {/* Current Round Checkpoints List */}
          {currentCheckpoints.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Checkpoints in Sequential Order ({currentCheckpoints.length})
              </h3>
              <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/60 px-3">
                {currentCheckpoints.map((cp, idx) => (
                  <li key={cp.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 font-mono text-[10px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-900">{cp.name}</span>
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">
                        {cp.id}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {cp.lat}, {cp.lng}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCurrentCheckpoint(cp.id)}
                      className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
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
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingRoundId ? 'Update & Sync Route' : 'Save & Sync Route'}
                </button>
                {editingRoundId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRoundId(null);
                      setRoundName('');
                      setCurrentCheckpoints([]);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SAVED ROUNDS WORKSPACE */}
        {routeWorkspace === 'routes' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { key: 'ALL', label: 'All Routes' },
                  { key: 'DAILY', label: 'Daily Midnight Reset' },
                  { key: 'HOURLY', label: 'Multi-Hour Auto-Repeat' },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setRepeatFilter(tab.key);
                      setRoutePage(1);
                    }}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      repeatFilter === tab.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}

                {canGuestEnroll && (
                  <>
                    <div className="mx-1 h-4 w-px bg-slate-200" />
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                      <input type="checkbox" checked={renewOnJoin} onChange={toggleRenewOnJoin} className="h-3.5 w-3.5 accent-brand-600" />
                      <span>Auto-renew on new Field guard join</span>
                    </label>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-brand-500 focus-within:bg-white">
                  <Search className="mr-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search route or checkpoint..."
                    value={routeSearch}
                    onChange={(e) => {
                      setRouteSearch(e.target.value);
                      setRoutePage(1);
                    }}
                    className="w-48 bg-transparent text-xs text-slate-800 outline-none sm:w-60"
                  />
                  {routeSearch && (
                    <button type="button" onClick={() => setRouteSearch('')} className="text-slate-400 hover:text-slate-700">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={fetchRounds}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingRounds ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 pl-5 pr-3">Route / Circuit Name</th>
                      <th className="w-[155px] px-3 py-3.5">Checkpoints</th>
                      <th className="w-[230px] px-3 py-3.5">Auto-Repeat Interval</th>
                      <th className="w-[130px] px-3 py-3.5">Created Date</th>
                      <th className="w-[340px] py-3.5 pl-3 pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoadingRounds ? (
                      Array.from({ length: 4 }).map((_, idx) => (
                        <tr key={idx}>
                          <td colSpan={5} className="px-5 py-3.5">
                            <div className="h-5 w-full animate-pulse rounded-lg bg-slate-100" />
                          </td>
                        </tr>
                      ))
                    ) : paginatedRounds.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                          No patrol routes match this filter. Click <strong>New Patrol Route</strong> to create one.
                        </td>
                      </tr>
                    ) : (
                      paginatedRounds.map((round) => (
                        <tr key={round.id} className="transition-colors hover:bg-slate-50/90">
                          <td className="py-3.5 pl-5 pr-3">
                            <div className="text-sm font-bold text-slate-900">{round.name}</div>
                            {round.checkpoints && round.checkpoints.length > 0 && (
                              <div className="mt-0.5 truncate max-w-md text-[11px] text-slate-400">
                                {round.checkpoints.map((c) => c.name).join(' → ')}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5">
                            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                              {round.checkpoints?.length || 0} stops
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <select
                              value={round.renew_every_minutes ? String(round.renew_every_minutes) : ''}
                              onChange={(e) => changeRepeat(round.id, e.target.value)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500"
                              title="How often this route starts a fresh round by itself"
                            >
                              {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              {round.renew_every_minutes && !REPEAT_OPTIONS.some((o) => o.value === String(round.renew_every_minutes)) && (
                                <option value={String(round.renew_every_minutes)}>Every {round.renew_every_minutes} min</option>
                              )}
                            </select>
                            {round.renewed_at && (
                              <div className="mt-1 font-mono text-[10px] text-slate-400">
                                Renewed {new Date(round.renewed_at).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-slate-500">
                            {new Date(round.created_at).toLocaleDateString()}
                          </td>
                          <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => renewNow(round)}
                                disabled={renewBusy !== null}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                                title="Make this route available again for a new guard"
                              >
                                <RefreshCw className={`h-3 w-3 ${renewBusy === round.id ? 'animate-spin' : ''}`} /> Renew
                              </button>
                              <button
                                type="button"
                                onClick={() => handleViewRound(round)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                              >
                                <Eye className="h-3 w-3" /> QRs
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadRoundPDF(round)}
                                disabled={isDownloading}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                              >
                                <Download className="h-3 w-3" /> PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditRound(round)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 transition hover:bg-amber-100"
                              >
                                <Edit2 className="h-3 w-3" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRound(round.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span>
                    Showing <strong className="font-mono text-slate-900">{routeStartItem}</strong>–
                    <strong className="font-mono text-slate-900">{routeEndItem}</strong> of{' '}
                    <strong className="font-mono text-slate-900">{totalRouteRecords}</strong> patrol routes
                  </span>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Per page:</span>
                    <select
                      value={routePageSize}
                      onChange={(e) => {
                        setRoutePageSize(Number(e.target.value));
                        setRoutePage(1);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none"
                    >
                      <option value={20}>20</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeRoutePage <= 1 || isLoadingRounds}
                    onClick={() => setRoutePage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>

                  {routePageNumbers.map((pNum, idx) =>
                    pNum === 'ellipsis' ? (
                      <span key={`el-${idx}`} className="px-2 text-slate-400">
                        …
                      </span>
                    ) : (
                      <button
                        key={pNum}
                        type="button"
                        onClick={() => setRoutePage(pNum)}
                        className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold transition ${
                          safeRoutePage === pNum
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {pNum}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    disabled={safeRoutePage >= totalRoutePages || isLoadingRounds}
                    onClick={() => setRoutePage((p) => Math.min(totalRoutePages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* VIEW ROUND MODAL */}
      {viewingRound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" onClick={() => setViewingRound(null)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">{viewingRound.name}</h3>
                <p className="text-xs text-slate-500">{viewingRound.checkpoints?.length || 0} Checkpoints (Sequential Order)</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadRoundPDF(viewingRound)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" /> Download PDF (1/page)
                </button>
                <button type="button" onClick={() => setViewingRound(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {viewingQRs.map((cp, idx) => (
                <div key={cp.id} className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <span className="mb-1 self-start rounded-full bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                    #{idx + 1}
                  </span>
                  <img src={cp.qrDataUri} alt={cp.name} className="mb-2 h-32 w-32 rounded bg-white" />
                  <span className="text-center text-sm font-bold text-slate-800">{cp.name}</span>
                  <span className="font-mono text-xs text-slate-500">{cp.id}</span>
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