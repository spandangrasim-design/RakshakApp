import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  UserCheck,
  MapPin,
  Shield,
  Layers,
  Timer,
  Navigation,
  X,
  Radio
} from 'lucide-react';

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

interface Checkpoint {
  id: string;
  name: string;
  lat: string;
  lng: string;
}

interface AssignedGuard {
  guard_id: string;
  full_name: string;
  employee_code: string;
}

interface Round {
  id: string;
  name: string;
  created_at?: string;
  assigned_guards?: AssignedGuard[];
  checkpoints: Checkpoint[];
}

interface ScanRecord {
  client_scan_id: string;
  checkpoint_id: string;
  checkpoint_name: string;
  guard_id: string;
  guard_name?: string;
  guard_code?: string;
  guard_lat: number;
  guard_lng: number;
  expected_lat?: string;
  expected_lng?: string;
  scan_time: string;
  is_verified?: boolean;
  distance_meters?: number;
  selfie_url?: string | null;
  location_photo_url?: string | null;
  photo_url?: string | null;
}

interface PatrolRun {
  runId: string;
  runNumber: number;
  roundId: string;
  roundName: string;
  totalRouteStops: number;
  dateKey: string;
  displayDate: string;
  guardName: string;
  guardCode: string;
  startTime: string;
  endTime: string;
  durationText: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  verifiedStopsCount: number;
  scans: ScanRecord[];
}

interface LiveTrailData {
  has_session: boolean;
  session?: {
    id: string;
    round_id: string;
    guard_id: string;
    guard_name: string;
    guard_code: string;
    status: string;
    start_time: string;
    end_time?: string;
    last_lat?: number;
    last_lng?: number;
    last_ping_at?: string;
  };
  breadcrumbs: { lat: number; lng: number; recorded_at: string }[];
}

function formatDuration(startIso: string, endIso: string, stopCount: number): string {
  if (!startIso || !endIso) return '—';
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (diffMs <= 1000) {
    return stopCount === 1 ? '< 1 min (1 Stop)' : '< 1 min';
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildPatrolRunsForRound(round: Round, rawScans: ScanRecord[]): PatrolRun[] {
  const totalStops = round.checkpoints?.length || 1;
  const defaultGuard = round.assigned_guards?.[0]?.full_name || 'Unassigned';
  const defaultCode = round.assigned_guards?.[0]?.employee_code || '';

  if (!rawScans || rawScans.length === 0) {
    return [
      {
        runId: `${round.id}-pending`,
        runNumber: 0,
        roundId: round.id,
        roundName: round.name,
        totalRouteStops: round.checkpoints?.length || 0,
        dateKey: 'PENDING',
        displayDate: 'No Scans Yet',
        guardName: defaultGuard,
        guardCode: defaultCode,
        startTime: '',
        endTime: '',
        durationText: '—',
        status: 'PENDING',
        verifiedStopsCount: 0,
        scans: [],
      },
    ];
  }

  const sorted = [...rawScans].sort(
    (a, b) => new Date(a.scan_time).getTime() - new Date(b.scan_time).getTime()
  );

  const runs: PatrolRun[] = [];
  let currentBucket: ScanRecord[] = [];
  let seenCheckpoints = new Set<string>();
  let currentDateKey = '';

  const flushBucket = (bucket: ScanRecord[], indexNum: number) => {
    if (bucket.length === 0) return;
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const dt = new Date(first.scan_time);
    const dateKey = dt.toISOString().split('T')[0];
    const displayDate = dt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const uniqueCps = new Set(bucket.map((s) => s.checkpoint_id)).size;
    const isCompleted = uniqueCps >= totalStops && totalStops > 0;

    runs.push({
      runId: `${round.id}-run-${indexNum}-${first.client_scan_id}`,
      runNumber: indexNum,
      roundId: round.id,
      roundName: round.name,
      totalRouteStops: round.checkpoints?.length || 0,
      dateKey,
      displayDate,
      guardName: first.guard_name || defaultGuard,
      guardCode: first.guard_code || defaultCode,
      startTime: first.scan_time,
      endTime: last.scan_time,
      durationText: formatDuration(first.scan_time, last.scan_time, uniqueCps),
      status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      verifiedStopsCount: uniqueCps,
      scans: bucket,
    });
  };

  for (const scan of sorted) {
    const scanDate = new Date(scan.scan_time).toISOString().split('T')[0];
    const prevScan = currentBucket[currentBucket.length - 1];
    const gapHours = prevScan
      ? (new Date(scan.scan_time).getTime() - new Date(prevScan.scan_time).getTime()) / 3600000
      : 0;

    if (
      currentBucket.length > 0 &&
      (scanDate !== currentDateKey ||
        seenCheckpoints.has(scan.checkpoint_id) ||
        seenCheckpoints.size >= totalStops ||
        gapHours > 4)
    ) {
      flushBucket(currentBucket, runs.length + 1);
      currentBucket = [];
      seenCheckpoints = new Set<string>();
    }

    currentDateKey = scanDate;
    currentBucket.push(scan);
    seenCheckpoints.add(scan.checkpoint_id);
  }

  flushBucket(currentBucket, runs.length + 1);
  return runs.reverse();
}

function loadLeafletAssets(): Promise<any> {
  return new Promise((resolve) => {
    if ((window as any).L) {
      resolve((window as any).L);
      return;
    }

    if (!document.getElementById('leaflet-css-cdn')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css-cdn';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById('leaflet-js-cdn');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve((window as any).L));
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-js-cdn';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve((window as any).L);
    document.body.appendChild(script);
  });
}

export const ReportsPage: React.FC = () => {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [scansByRound, setScansByRound] = useState<Record<string, ScanRecord[]>>({});
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('ALL');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [mapModalRun, setMapModalRun] = useState<PatrolRun | null>(null);
  const [liveTrail, setLiveTrail] = useState<LiveTrailData | null>(null);
  const [loadingTrail, setLoadingTrail] = useState(false);
  const [autoRefreshMap, setAutoRefreshMap] = useState(true);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);

  const fetchAllReportsData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/rounds`);
      const data = await res.json();
      const roundList: Round[] = data.rounds || [];
      setRounds(roundList);

      const scanEntries = await Promise.all(
        roundList.map(async (r) => {
          try {
            const sRes = await fetch(`${API_BASE_URL}/rounds/${r.id}/scans`);
            const sData = await sRes.json();
            return [r.id, sData.scans || []] as [string, ScanRecord[]];
          } catch {
            return [r.id, []] as [string, ScanRecord[]];
          }
        })
      );

      const map: Record<string, ScanRecord[]> = {};
      for (const [rId, sList] of scanEntries) {
        map[rId] = sList;
      }
      setScansByRound(map);
    } catch (err) {
      console.error('Failed to load patrol reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllReportsData();
  }, []);

  const fetchLiveTrailForRound = async (roundId: string) => {
    try {
      setLoadingTrail(true);
      const res = await fetch(`${API_BASE_URL}/rounds/${roundId}/live-trail`);
      const data = await res.json();
      if (data.success) {
        setLiveTrail(data);
      }
    } catch (e) {
      console.error('Failed to fetch live trail:', e);
    } finally {
      setLoadingTrail(false);
    }
  };

  useEffect(() => {
    if (!mapModalRun) {
      setLiveTrail(null);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    fetchLiveTrailForRound(mapModalRun.roundId);

    if (!autoRefreshMap) return;
    const interval = setInterval(() => {
      fetchLiveTrailForRound(mapModalRun.roundId);
    }, 10000);

    return () => clearInterval(interval);
  }, [mapModalRun, autoRefreshMap]);

  // Render Leaflet Map showing BOTH QR Code Expected Locations AND Guard Actual Capture Locations
  useEffect(() => {
    if (!mapModalRun || !mapContainerRef.current) return;

    let isMounted = true;
    const targetRound = rounds.find((r) => r.id === mapModalRun.roundId);

    loadLeafletAssets().then((L) => {
      if (!isMounted || !L || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = L.map(mapContainerRef.current).setView([20.5937, 78.9629], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);
      }

      const map = mapInstanceRef.current;

      map.eachLayer((layer: any) => {
        if (!layer._url) {
          map.removeLayer(layer);
        }
      });

      const boundsPoints: [number, number][] = [];
      const plannedCoords: [number, number][] = [];

      const capturedByCpId = new Map<string, ScanRecord>();
      mapModalRun.scans.forEach((s) => {
        capturedByCpId.set(s.checkpoint_id, s);
      });

      const checkpoints = targetRound?.checkpoints || [];

      // 1. Plot Expected QR Code Locations (Square Badge: "QR 1", "QR 2"...)
      checkpoints.forEach((cp, index) => {
        const lat = parseFloat(cp.lat);
        const lng = parseFloat(cp.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        boundsPoints.push([lat, lng]);
        plannedCoords.push([lat, lng]);

        const capturedScan = capturedByCpId.get(cp.id);
        const isCaptured = !!capturedScan;

        const bg = isCaptured ? '#059669' : '#334155';
        const border = isCaptured ? '#a7f3d0' : '#ffffff';

        const qrIcon = L.divIcon({
          className: '',
          html: `<div style="background:${bg};color:#fff;padding:2px 6px;min-width:38px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;border:2px solid ${border};box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;">QR #${index + 1}</div>`,
          iconSize: [44, 26],
          iconAnchor: [22, 13],
        });

        L.marker([lat, lng], { icon: qrIcon })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:12px;line-height:1.4;">
              <strong style="color:#0f172a;">📍 QR Code #${index + 1} Expected Location</strong><br/>
              <span>Checkpoint: <b>${cp.name}</b></span><br/>
              <span style="font-family:monospace;font-size:11px;color:#475569;">QR GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}</span><br/>
              <span style="color:${isCaptured ? '#059669' : '#64748b'};font-weight:bold;">
                ${isCaptured ? '✅ Scanned in this session' : '⏳ Pending Scan'}
              </span>
            </div>`
          );
      });

      // 2. Draw Subtle Grey Dashed Line for Planned QR Route
      if (plannedCoords.length > 1) {
        L.polyline(plannedCoords, {
          color: '#94a3b8',
          weight: 2,
          opacity: 0.7,
          dashArray: '4, 6',
        }).addTo(map);
      }

      // 3. Plot Guard Actual Capture Locations (Where the guard actually stood when taking Selfie/Photo)
      mapModalRun.scans.forEach((scan, scanIdx) => {
        const gLat = Number(scan.guard_lat);
        const gLng = Number(scan.guard_lng);
        if (isNaN(gLat) || isNaN(gLng) || (gLat === 0 && gLng === 0)) return;

        boundsPoints.push([gLat, gLng]);

        const matchCpIndex = checkpoints.findIndex((c) => c.id === scan.checkpoint_id);
        const stopLabelNum = matchCpIndex >= 0 ? matchCpIndex + 1 : scanIdx + 1;
        const matchCp = matchCpIndex >= 0 ? checkpoints[matchCpIndex] : null;

        const expLat = matchCp ? parseFloat(matchCp.lat) : Number(scan.expected_lat || 0);
        const expLng = matchCp ? parseFloat(matchCp.lng) : Number(scan.expected_lng || 0);

        const driftMeters =
          !isNaN(expLat) && !isNaN(expLng) && expLat !== 0
            ? Math.round(getDistanceMeters(gLat, gLng, expLat, expLng))
            : Math.round(scan.distance_meters || 0);

        const isFarAway = driftMeters > 50;
        const capBg = isFarAway ? '#dc2626' : '#0284c7';

        const captureIcon = L.divIcon({
          className: '',
          html: `<div style="background:${capBg};color:#fff;padding:2px 7px;min-width:48px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);white-space:nowrap;">${
            isFarAway ? '⚠️' : '📸'
          } Cap #${stopLabelNum}</div>`,
          iconSize: [56, 26],
          iconAnchor: [28, 13],
        });

        const selfieImg = scan.selfie_url || '';
        L.marker([gLat, gLng], { icon: captureIcon })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:12px;line-height:1.45;min-width:190px;">
              <strong style="color:${capBg};">${
              isFarAway ? '⚠️ Far Away Capture' : '📸 Guard Capture Location'
            } (Stop #${stopLabelNum})</strong><br/>
              <span>Checkpoint: <b>${scan.checkpoint_name}</b></span><br/>
              <span>Time: <b>${new Date(scan.scan_time).toLocaleTimeString()}</b></span><br/>
              <span style="font-family:monospace;font-size:11px;">Guard GPS: ${gLat.toFixed(5)}, ${gLng.toFixed(5)}</span><br/>
              <span style="font-weight:bold;color:${isFarAway ? '#dc2626' : '#059669'};">
                Distance from QR #${stopLabelNum}: ${driftMeters}m ${
              isFarAway ? '(OUT OF RANGE)' : '(Within Range)'
            }
              </span>
              ${
                selfieImg
                  ? `<div style="margin-top:6px;"><img src="${selfieImg}" style="width:100%;height:90px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;" /></div>`
                  : ''
              }
            </div>`
          );

        // Draw Red/Amber Drift Line connecting Expected QR Location <-> Actual Guard Capture Location
        if (!isNaN(expLat) && !isNaN(expLng) && expLat !== 0 && driftMeters > 5) {
          L.polyline(
            [
              [expLat, expLng],
              [gLat, gLng],
            ],
            {
              color: isFarAway ? '#ef4444' : '#10b981',
              weight: isFarAway ? 3 : 2,
              dashArray: '5, 5',
              opacity: 0.9,
            }
          )
            .addTo(map)
            .bindPopup(
              `<strong>GPS Offset (Stop #${stopLabelNum})</strong><br/>Guard captured this QR from <b>${driftMeters} meters</b> away.`
            );
        }
      });

      // 4. Draw Actual Guard Walking Path (Filtered for stationary jitter)
      const rawCrumbs = (liveTrail?.breadcrumbs || [])
        .map((b) => [Number(b.lat), Number(b.lng)] as [number, number])
        .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng) && lat !== 0);

      const cleanTrail: [number, number][] = [];
      for (let i = 0; i < rawCrumbs.length; i++) {
        const pt = rawCrumbs[i];
        const prev = cleanTrail.length > 0 ? cleanTrail[cleanTrail.length - 1] : null;
        if (prev && getDistanceMeters(prev[0], prev[1], pt[0], pt[1]) < 6) {
          continue;
        }
        cleanTrail.push(pt);
      }

      if (cleanTrail.length > 1) {
        L.polyline(cleanTrail, {
          color: '#2563eb',
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
      }
      cleanTrail.forEach((pt) => boundsPoints.push(pt));

      // 5. Plot Live Guard Position ("G")
      const lastScan = mapModalRun.scans[mapModalRun.scans.length - 1];
      const liveLat = liveTrail?.session?.last_lat ?? lastScan?.guard_lat;
      const liveLng = liveTrail?.session?.last_lng ?? lastScan?.guard_lng;

      if (liveLat && liveLng && !isNaN(Number(liveLat)) && !isNaN(Number(liveLng))) {
        const gLat = Number(liveLat);
        const gLng = Number(liveLng);
        boundsPoints.push([gLat, gLng]);

        const liveIcon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:rgba(37,99,235,0.28);"></div>
            <div style="position:relative;background:#1d4ed8;color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">G</div>
          </div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        L.marker([gLat, gLng], { icon: liveIcon })
          .addTo(map)
          .bindPopup(
            `<strong>Live Guard Position: ${
              liveTrail?.session?.guard_name || mapModalRun.guardName
            }</strong><br/>GPS: ${gLat.toFixed(5)}, ${gLng.toFixed(5)}`
          );
      }

      if (boundsPoints.length > 0) {
        map.fitBounds(boundsPoints, { padding: [55, 55], maxZoom: 18 });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [mapModalRun, liveTrail, rounds]);

  const allPatrolRuns = useMemo(() => {
    const list: PatrolRun[] = [];
    for (const r of rounds) {
      const rScans = scansByRound[r.id] || [];
      const runs = buildPatrolRunsForRound(r, rScans);
      list.push(...runs);
    }
    return list.sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  }, [rounds, scansByRound]);

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    allPatrolRuns.forEach((run) => {
      if (run.dateKey && run.dateKey !== 'PENDING') set.add(run.dateKey);
    });
    return Array.from(set).sort().reverse();
  }, [allPatrolRuns]);

  const filteredRuns = useMemo(() => {
    return allPatrolRuns.filter((run) => {
      if (selectedRouteFilter !== 'ALL' && run.roundId !== selectedRouteFilter) return false;
      if (selectedDate !== 'ALL' && run.dateKey !== selectedDate) return false;
      return true;
    });
  }, [allPatrolRuns, selectedRouteFilter, selectedDate]);

  useEffect(() => {
    if (filteredRuns.length > 0 && (!selectedRunId || !filteredRuns.some((r) => r.runId === selectedRunId))) {
      const firstActive = filteredRuns.find((r) => r.scans.length > 0) || filteredRuns[0];
      setSelectedRunId(firstActive.runId);
    }
  }, [filteredRuns, selectedRunId]);

  const inspectedRun = useMemo(
    () => filteredRuns.find((r) => r.runId === selectedRunId) || filteredRuns[0] || null,
    [filteredRuns, selectedRunId]
  );

  const completedCount = filteredRuns.filter((r) => r.status === 'COMPLETED').length;
  const inProgressCount = filteredRuns.filter((r) => r.status === 'IN_PROGRESS').length;
  const totalScansCount = filteredRuns.reduce((acc, r) => acc + r.scans.length, 0);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header & Filters */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Patrol Audit & Live Route Tracking
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Compare expected QR checkpoint locations against actual guard capture GPS coordinates and live walking trails.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedRouteFilter}
                onChange={(e) => setSelectedRouteFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent outline-none"
              >
                <option value="ALL">All Patrol Routes</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.checkpoints?.length || 0} stops)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent outline-none"
              >
                <option value="ALL">All Dates</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchAllReportsData}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                Completed Patrol Runs
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">{completedCount}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                Partial / In-Progress Runs
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">{inProgressCount}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                Total QR Stops Verified
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">{totalScansCount}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Patrol Runs Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Patrol Sessions ({filteredRuns.length} Runs)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">Route / Site Name</th>
                  <th className="px-4 py-3">Date & Session</th>
                  <th className="px-4 py-3">Guard</th>
                  <th className="px-4 py-3">Start Time</th>
                  <th className="px-4 py-3">End Time</th>
                  <th className="px-4 py-3">Total Time Taken</th>
                  <th className="px-4 py-3">Stops Progress</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400">
                      Loading patrol runs...
                    </td>
                  </tr>
                ) : filteredRuns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400">
                      No patrol sessions found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredRuns.map((run) => {
                    const isSelected = inspectedRun?.runId === run.runId;
                    return (
                      <tr
                        key={run.runId}
                        onClick={() => setSelectedRunId(run.runId)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{run.roundName}</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-[10px]">
                              {run.totalRouteStops} {run.totalRouteStops === 1 ? 'stop' : 'stops'}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {run.status === 'PENDING' ? (
                            <span className="text-slate-400 italic">No scans yet</span>
                          ) : (
                            <div>
                              <div className="font-bold text-slate-800">{run.displayDate}</div>
                              <div className="text-[10px] text-blue-600 font-semibold">
                                Patrol Run #{run.runNumber}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            <div>
                              <div className="font-semibold text-slate-800">{run.guardName}</div>
                              {run.guardCode && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  ID: {run.guardCode}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 font-mono text-slate-700">
                          {run.startTime ? new Date(run.startTime).toLocaleTimeString() : '—'}
                        </td>

                        <td className="px-4 py-3.5 font-mono text-slate-700">
                          {run.endTime
                            ? run.status === 'COMPLETED'
                              ? new Date(run.endTime).toLocaleTimeString()
                              : `${new Date(run.endTime).toLocaleTimeString()} (Latest)`
                            : '—'}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                            <Timer className="w-3 h-3 text-blue-600" />
                            {run.durationText}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="font-bold text-slate-800">
                            {run.verifiedStopsCount} / {run.totalRouteStops}
                          </span>
                          <span className="text-slate-400 ml-1">captured</span>
                        </td>

                        <td className="px-4 py-3.5">
                          {run.status === 'COMPLETED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              COMPLETED
                            </span>
                          )}
                          {run.status === 'IN_PROGRESS' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                              IN_PROGRESS
                            </span>
                          )}
                          {run.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px]">
                              NOT STARTED
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMapModalRun(run);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition"
                            >
                              <Navigation className="w-3 h-3" /> Live Map
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRunId(run.runId);
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                  : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                              }`}
                            >
                              Inspect <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Patrol Run Inspection Panel */}
        {inspectedRun && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-black text-slate-900">
                    Checkpoints Captured ({inspectedRun.verifiedStopsCount} of {inspectedRun.totalRouteStops})
                  </h2>
                  {inspectedRun.runNumber > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs">
                      {inspectedRun.displayDate} • Run #{inspectedRun.runNumber}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Route: <strong className="text-blue-600">{inspectedRun.roundName}</strong> • Guard:{' '}
                  <strong>{inspectedRun.guardName}</strong> • Total Time:{' '}
                  <strong>{inspectedRun.durationText}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMapModalRun(inspectedRun)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition"
                >
                  <Navigation className="w-3.5 h-3.5" /> View Live Map & Capture Locations
                </button>
              </div>
            </div>

            {inspectedRun.scans.length === 0 ? (
              <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No checkpoints have been scanned in this session yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {inspectedRun.scans.map((scan, idx) => {
                  const selfieImg = scan.selfie_url || null;
                  const locationImg = scan.location_photo_url || scan.photo_url || null;

                  const expLat = Number(scan.expected_lat || 0);
                  const expLng = Number(scan.expected_lng || 0);
                  const gLat = Number(scan.guard_lat || 0);
                  const gLng = Number(scan.guard_lng || 0);

                  const computedDist =
                    expLat !== 0 && gLat !== 0
                      ? Math.round(getDistanceMeters(gLat, gLng, expLat, expLng))
                      : Math.round(scan.distance_meters || 0);

                  const isFarAway = computedDist > 50;

                  return (
                    <div
                      key={scan.client_scan_id || idx}
                      className={`border rounded-2xl p-4 space-y-3 bg-white shadow-sm ${
                        isFarAway ? 'border-rose-300' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-wider text-emerald-600">
                            QR STOP #{idx + 1} OF {inspectedRun.totalRouteStops}
                          </div>
                          <div className="text-base font-bold text-slate-900 mt-0.5">
                            {scan.checkpoint_name || inspectedRun.roundName}
                          </div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {new Date(scan.scan_time).toLocaleString()}
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            !isFarAway
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {!isFarAway ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Within Range ({computedDist}m)
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" /> Far From QR ({computedDist}m away)
                            </>
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                            1. Guard Selfie
                          </div>
                          {selfieImg ? (
                            <a href={selfieImg} target="_blank" rel="noopener noreferrer">
                              <img
                                src={selfieImg}
                                alt="Guard Face Proof"
                                className="w-full h-44 object-cover rounded-xl border border-slate-200 bg-slate-900 hover:opacity-95 transition"
                              />
                            </a>
                          ) : (
                            <div className="w-full h-44 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">
                              No Selfie Recorded
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                            2. Location Proof
                          </div>
                          {locationImg ? (
                            <a href={locationImg} target="_blank" rel="noopener noreferrer">
                              <img
                                src={locationImg}
                                alt="Checkpoint Location Proof"
                                className="w-full h-44 object-cover rounded-xl border border-slate-200 bg-slate-900 hover:opacity-95 transition"
                              />
                            </a>
                          ) : (
                            <div className="w-full h-44 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">
                              No Location Photo
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Side-by-side Expected QR GPS vs Actual Guard Capture GPS */}
                      <div className="pt-2.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                          <span className="font-bold text-slate-600 block">📍 QR Code Expected Location:</span>
                          <span className="font-mono text-slate-800">
                            {expLat ? `${expLat.toFixed(5)}, ${expLng.toFixed(5)}` : 'N/A'}
                          </span>
                        </div>
                        <div
                          className={`px-2.5 py-1.5 rounded-lg border ${
                            isFarAway
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          }`}
                        >
                          <span className="font-bold block">📸 Guard Capture Location:</span>
                          <span className="font-mono">
                            {gLat.toFixed(5)}, {gLng.toFixed(5)} ({computedDist}m offset)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ON-DEMAND LIVE MAP & WALKING TRAIL MODAL */}
      {mapModalRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <h3 className="text-base font-bold">
                    Live Route Map (QR Locations vs Guard Capture Locations): {mapModalRun.roundName}
                  </h3>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Guard: <strong>{liveTrail?.session?.guard_name || mapModalRun.guardName}</strong> •{' '}
                  Captured Stops:{' '}
                  <strong className="text-emerald-400">
                    {mapModalRun.verifiedStopsCount} of {mapModalRun.totalRouteStops}
                  </strong>{' '}
                  • Breadcrumbs: <strong>{liveTrail?.breadcrumbs?.length || 0} pts</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoRefreshMap(!autoRefreshMap)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    autoRefreshMap
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {autoRefreshMap ? 'Auto-Refresh: ON (10s)' : 'Auto-Refresh: OFF'}
                </button>

                <button
                  onClick={() => fetchLiveTrailForRound(mapModalRun.roundId)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTrail ? 'animate-spin' : ''}`} />
                  Refresh Now
                </button>

                <button
                  onClick={() => setMapModalRun(null)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Map Legend Clearly Distinguishing QR Location vs Guard Capture Location */}
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5 font-bold text-emerald-800">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black">
                    QR #1
                  </span>
                  Scanned QR Code Location
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <span className="px-1.5 py-0.5 rounded bg-slate-700 text-white text-[9px] font-black">
                    QR #2
                  </span>
                  Pending QR Code Location
                </span>
                <span className="flex items-center gap-1.5 font-bold text-sky-700">
                  <span className="px-2 py-0.5 rounded-full bg-sky-600 text-white text-[9px] font-bold">
                    📸 Cap #1
                  </span>
                  Guard Capture GPS (Within 50m)
                </span>
                <span className="flex items-center gap-1.5 font-bold text-rose-700">
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-bold">
                    ⚠️ Cap #1
                  </span>
                  Guard Capture GPS (&gt;50m Far Away)
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-rose-600">
                  <span className="w-4 h-0.5 border-b-2 border-dashed border-rose-500 inline-block"></span>
                  Drift Offset Line
                </span>
              </div>
            </div>

            <div className="relative flex-1 min-h-[460px] bg-slate-100">
              <div ref={mapContainerRef} className="w-full h-[460px] z-10" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;