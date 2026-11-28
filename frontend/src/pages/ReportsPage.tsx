import * as XLSX from 'xlsx';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Shield,
  Layers,
  Timer,
  Navigation,
  X,
  Radio,
  FileSpreadsheet,
  Search
} from 'lucide-react';

import { API_V1 as API_BASE_URL } from '../lib/api';

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
  active_session?: {
    id: string;
    round_id: string;
    guard_id: string;
    guard_name?: string;
    guard_code?: string;
    status: string;
    start_time: string;
    last_lat?: number;
    last_lng?: number;
    last_ping_at?: string;
  } | null;
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
  [key: string]: any;
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
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PAUSED' | 'PARTIAL' | 'PENDING';
  isHandover?: boolean;
  handoverNote?: string;
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

// Extracts real guard capture lat/lng from numeric fields, PostGIS EWKB Hex, or GeoJSON
function resolveGuardCaptureCoords(scan: ScanRecord): { lat: number; lng: number; isEstimated: boolean } {
  const directLat = Number(scan.guard_lat ?? scan.lat ?? 0);
  const directLng = Number(scan.guard_lng ?? scan.lng ?? 0);
  if (directLat !== 0 && directLng !== 0 && !isNaN(directLat) && !isNaN(directLng)) {
    return { lat: directLat, lng: directLng, isEstimated: false };
  }

  for (const val of Object.values(scan)) {
    if (typeof val === 'string') {
      const clean = val.trim();
      const hasSrid = clean.toUpperCase().startsWith('0101000020');
      const noSrid = clean.toUpperCase().startsWith('0101000000');
      if ((hasSrid || noSrid) && clean.length >= (hasSrid ? 50 : 42)) {
        try {
          const offset = hasSrid ? 18 : 10;
          const bytes = new Uint8Array(16);
          for (let i = 0; i < 16; i++) {
            bytes[i] = parseInt(clean.slice(offset + i * 2, offset + i * 2 + 2), 16);
          }
          const view = new DataView(bytes.buffer);
          const lng = view.getFloat64(0, true);
          const lat = view.getFloat64(8, true);
          if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat !== 0) {
            return { lat, lng, isEstimated: false };
          }
        } catch (_) {}
      }

      const ptMatch = clean.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
      if (ptMatch) {
        return { lat: parseFloat(ptMatch[2]), lng: parseFloat(ptMatch[1]), isEstimated: false };
      }
    } else if (val && typeof val === 'object' && Array.isArray((val as any).coordinates)) {
      const [lng, lat] = (val as any).coordinates;
      if (lat && lng) return { lat: Number(lat), lng: Number(lng), isEstimated: false };
    }
  }

  // Fallback for legacy scans where DB only saved distance_meters + expected_lat/lng
  const expLat = Number(scan.expected_lat || 0);
  const expLng = Number(scan.expected_lng || 0);
  const dist = Number(scan.distance_meters || 0);
  if (expLat !== 0 && expLng !== 0 && dist > 0) {
    const latOffset = (dist / 111320) * 0.7071;
    const lngOffset = (dist / (111320 * Math.cos((expLat * Math.PI) / 180))) * 0.7071;
    return {
      lat: expLat + latOffset,
      lng: expLng - lngOffset,
      isEstimated: true,
    };
  }

  return { lat: 0, lng: 0, isEstimated: false };
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
    if (round.active_session) {
      const st = new Date(round.active_session.start_time);
      return [
        {
          runId: round.active_session.id,
          runNumber: 1,
          roundId: round.id,
          roundName: round.name,
          totalRouteStops: round.checkpoints?.length || 0,
          dateKey: st.toISOString().split('T')[0],
          displayDate: st.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          guardName: round.active_session.guard_name || defaultGuard,
          guardCode: round.active_session.guard_code || defaultCode,
          startTime: round.active_session.start_time,
          endTime: '',
          durationText: 'Live (0 Stops Yet)',
          status: round.active_session.status === 'PAUSED' ? 'PAUSED' : 'IN_PROGRESS',
          verifiedStopsCount: 0,
          scans: [],
        },
      ];
    }
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

  const flushBucket = (bucket: ScanRecord[], indexNum: number, nextScan?: ScanRecord) => {
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
    const isHandover = !!nextScan && nextScan.guard_id !== first.guard_id;

    let runStatus: 'COMPLETED' | 'IN_PROGRESS' | 'PAUSED' | 'PARTIAL' = 'IN_PROGRESS';
    let handoverNote = '';

    if (isCompleted) {
      runStatus = 'COMPLETED';
    } else if (isHandover) {
      runStatus = 'PARTIAL';
      handoverNote = `Handed over (${uniqueCps}/${totalStops} stops completed)`;
    } else {
      const msSinceLast = Date.now() - new Date(last.scan_time).getTime();
      if (msSinceLast > 30 * 60000) {
        runStatus = 'PARTIAL';
        handoverNote = `Ended partially (${uniqueCps}/${totalStops} stops done)`;
      } else {
        runStatus = 'IN_PROGRESS';
      }
    }

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
      status: runStatus,
      verifiedStopsCount: uniqueCps,
      scans: bucket,
      isHandover,
      handoverNote,
    });
  };

  for (let i = 0; i < sorted.length; i++) {
    const scan = sorted[i];
    const scanDate = new Date(scan.scan_time).toISOString().split('T')[0];
    const prevScan = currentBucket[currentBucket.length - 1];
    const gapHours = prevScan
      ? (new Date(scan.scan_time).getTime() - new Date(prevScan.scan_time).getTime()) / 3600000
      : 0;

    const isNewGuard = currentBucket.length > 0 && scan.guard_id && prevScan?.guard_id && scan.guard_id !== prevScan.guard_id;

    if (
      currentBucket.length > 0 &&
      (scanDate !== currentDateKey ||
        isNewGuard ||
        seenCheckpoints.has(scan.checkpoint_id) ||
        seenCheckpoints.size >= totalStops ||
        gapHours > 4)
    ) {
      flushBucket(currentBucket, runs.length + 1, scan);
      currentBucket = [];
      seenCheckpoints = new Set<string>();
    }

    currentDateKey = scanDate;
    currentBucket.push(scan);
    seenCheckpoints.add(scan.checkpoint_id);
  }

  if (currentBucket.length > 0) {
    flushBucket(currentBucket, runs.length + 1);
  }

  if (round.active_session) {
    const activeStartMs = new Date(round.active_session.start_time).getTime();
    const activeDateKey = new Date(round.active_session.start_time).toISOString().split('T')[0];
    const hasRunForActive = runs.some((r) =>
      r.startTime &&
      (
        (r.status !== 'COMPLETED' && new Date(r.startTime).getTime() >= activeStartMs - 120000) ||
        (r.dateKey === activeDateKey && new Date(r.startTime).getTime() >= activeStartMs - 120000)
      )
    );
    if (!hasRunForActive) {
      const st = new Date(round.active_session.start_time);
      runs.push({
        runId: round.active_session.id,
        runNumber: runs.length + 1,
        roundId: round.id,
        roundName: round.name,
        totalRouteStops: round.checkpoints?.length || 0,
        dateKey: st.toISOString().split('T')[0],
        displayDate: st.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        guardName: round.active_session.guard_name || defaultGuard,
        guardCode: round.active_session.guard_code || defaultCode,
        startTime: round.active_session.start_time,
        endTime: '',
        durationText: 'Live (0 Stops Yet)',
        status: round.active_session.status === 'PAUSED' ? 'PAUSED' : 'IN_PROGRESS',
        verifiedStopsCount: 0,
        scans: [],
      });
    }
  }
  return runs.reverse();
}

function loadLeafletAssets(): Promise<any> {
  (window as any).L = (window as any).L || L;
  return Promise.resolve((window as any).L);
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
  const [mapZoomFocus, setMapZoomFocus] = useState<'ALL' | 'QR' | 'GUARD'>('ALL');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const hasInitialFitRef = useRef<boolean>(false);
  const userMovedMapRef = useRef<boolean>(false);

  const fetchAllReportsData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token') || '';
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE_URL}/rounds`, { headers });
      const data = await res.json();
      const roundList: Round[] = data.rounds || [];
      setRounds(roundList);

      const scanEntries = await Promise.all(
        roundList.map(async (r) => {
          try {
            const sRes = await fetch(`${API_BASE_URL}/rounds/${r.id}/scans`, { headers });
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
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${API_BASE_URL}/rounds/${roundId}/live-trail`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
      setMapZoomFocus('ALL');
      hasInitialFitRef.current = false;
      userMovedMapRef.current = false;
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
    }, 4000);

    return () => clearInterval(interval);
  }, [mapModalRun, autoRefreshMap]);

  // Render Leaflet Map showing BOTH QR Code Expected Locations AND Guard Capture Locations
  useEffect(() => {
    if (!mapModalRun || !mapContainerRef.current) return;

    let isMounted = true;
    const targetRound = rounds.find((r) => r.id === mapModalRun.roundId);

    loadLeafletAssets().then((L) => {
      if (!isMounted || !L || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = L.map(mapContainerRef.current).setView([22.275, 73.156], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);
        mapInstanceRef.current.on('dragstart zoomstart', (e: any) => {
          if (e?.hard !== true) userMovedMapRef.current = true;
        });
      }

      const map = mapInstanceRef.current;

      map.eachLayer((layer: any) => {
        if (!layer._url) {
          map.removeLayer(layer);
        }
      });

      const allBounds: [number, number][] = [];
      const qrBounds: [number, number][] = [];
      const guardBounds: [number, number][] = [];
      const plannedCoords: [number, number][] = [];

      const capturedByCpId = new Map<string, ScanRecord>();
      mapModalRun.scans.forEach((s) => {
        capturedByCpId.set(s.checkpoint_id, s);
      });

      const checkpoints = targetRound?.checkpoints || [];

      // 1. Plot Expected QR Code Locations ("QR #1", "QR #2"...)
      checkpoints.forEach((cp, index) => {
        const lat = parseFloat(cp.lat);
        const lng = parseFloat(cp.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        allBounds.push([lat, lng]);
        qrBounds.push([lat, lng]);
        plannedCoords.push([lat, lng]);

        const capturedScan = capturedByCpId.get(cp.id);
        const isCaptured = !!capturedScan;

        const bg = isCaptured ? '#059669' : '#334155';
        const border = isCaptured ? '#a7f3d0' : '#ffffff';

        const qrIcon = L.divIcon({
          className: '',
          html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
            <div style="background:${bg};color:#fff;padding:2px 6px;min-width:42px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:10px;border:2px solid ${border};box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;">QR #${index + 1}</div>
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${bg};margin-top:-1px;"></div>
          </div>`,
          iconSize: [46, 30],
          iconAnchor: [23, 30],
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

      // 2. Planned Route Line
      if (plannedCoords.length > 1) {
        L.polyline(plannedCoords, {
          color: '#94a3b8',
          weight: 2,
          opacity: 0.7,
          dashArray: '4, 6',
        }).addTo(map);
      }

      // 3. Plot Guard Capture Locations (Decoded from numeric or PostGIS EWKB)
      mapModalRun.scans.forEach((scan, scanIdx) => {
        const resolved = resolveGuardCaptureCoords(scan);
        const gLat = resolved.lat;
        const gLng = resolved.lng;
        if (isNaN(gLat) || isNaN(gLng) || (gLat === 0 && gLng === 0)) return;

        allBounds.push([gLat, gLng]);
        guardBounds.push([gLat, gLng]);

        const matchCpIndex = checkpoints.findIndex((c) => c.id === scan.checkpoint_id);
        const stopLabelNum = matchCpIndex >= 0 ? matchCpIndex + 1 : scanIdx + 1;
        const matchCp = matchCpIndex >= 0 ? checkpoints[matchCpIndex] : null;

        const expLat = matchCp ? parseFloat(matchCp.lat) : Number(scan.expected_lat || 0);
        const expLng = matchCp ? parseFloat(matchCp.lng) : Number(scan.expected_lng || 0);

        const driftMeters =
          scan.distance_meters !== undefined && Number(scan.distance_meters) > 0
            ? Math.round(Number(scan.distance_meters))
            : !isNaN(expLat) && !isNaN(expLng) && expLat !== 0
            ? Math.round(getDistanceMeters(gLat, gLng, expLat, expLng))
            : 0;

        const isFarAway = driftMeters > 50;
        const capBg = isFarAway ? '#dc2626' : '#0284c7';

        const captureIcon = L.divIcon({
          className: '',
          html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:6px solid ${capBg};margin-bottom:-1px;"></div>
            <div style="background:${capBg};color:#fff;padding:2px 8px;min-width:54px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.45);white-space:nowrap;">${
              isFarAway ? '⚠️' : '📸'
            } Cap #${stopLabelNum}</div>
          </div>`,
          iconSize: [62, 30],
          iconAnchor: [31, 0],
        });

        const selfieImg = scan.selfie_url || '';
        L.marker([gLat, gLng], { icon: captureIcon })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:12px;line-height:1.45;min-width:200px;">
              <strong style="color:${capBg};">${
              isFarAway ? '⚠️ Far Away Guard Capture' : '📸 Guard Capture Location'
            } (Stop #${stopLabelNum})</strong><br/>
              <span>Checkpoint: <b>${scan.checkpoint_name}</b></span><br/>
              <span>Scanned At: <b>${new Date(scan.scan_time).toLocaleTimeString()}</b></span><br/>
              <span style="font-family:monospace;font-size:11px;">Guard GPS: <b>${gLat.toFixed(5)}, ${gLng.toFixed(5)}</b></span><br/>
              <span style="font-family:monospace;font-size:11px;color:#64748b;">QR GPS: ${expLat.toFixed(5)}, ${expLng.toFixed(5)}</span><br/>
              <span style="font-weight:bold;color:${isFarAway ? '#dc2626' : '#059669'};">
                Distance Offset: ${driftMeters}m ${isFarAway ? '(FLAGGED > 50m)' : '(Verified)'}
              </span>
              ${
                selfieImg
                  ? `<div style="margin-top:6px;"><img src="${selfieImg}" style="width:100%;height:95px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;" /></div>`
                  : ''
              }
            </div>`
          );

        // Draw Red Dashed Drift Line connecting QR Expected Location <-> Guard Capture Location
        if (!isNaN(expLat) && !isNaN(expLng) && expLat !== 0 && driftMeters > 5) {
          L.polyline(
            [
              [expLat, expLng],
              [gLat, gLng],
            ],
            {
              color: isFarAway ? '#ef4444' : '#0ea5e9',
              weight: isFarAway ? 2.5 : 2,
              dashArray: '6, 6',
              opacity: 0.85,
            }
          )
            .addTo(map)
            .bindPopup(
              `<strong>Stop #${stopLabelNum} Drift Offset</strong><br/>Guard captured this QR from <b>${driftMeters} meters</b> away.`
            );
        }
      });

      // 4. Draw Actual Guard Walking Trail
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
      cleanTrail.forEach((pt) => {
        allBounds.push(pt);
        guardBounds.push(pt);
      });

      // 5. Plot Live Guard Marker ("G")
      const lastScan = mapModalRun.scans[mapModalRun.scans.length - 1];
      const lastScanResolved = lastScan ? resolveGuardCaptureCoords(lastScan) : { lat: 0, lng: 0 };
      const latestCrumb = rawCrumbs.length > 0 ? rawCrumbs[rawCrumbs.length - 1] : null;
      const liveLat = liveTrail?.session?.last_lat || latestCrumb?.[0] || lastScanResolved.lat;
      const liveLng = liveTrail?.session?.last_lng || latestCrumb?.[1] || lastScanResolved.lng;

      if (liveLat && liveLng && !isNaN(Number(liveLat)) && !isNaN(Number(liveLng)) && Number(liveLat) !== 0) {
        const gLat = Number(liveLat);
        const gLng = Number(liveLng);
        allBounds.push([gLat, gLng]);
        guardBounds.push([gLat, gLng]);

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
            `<strong>Guard Last Position: ${
              liveTrail?.session?.guard_name || mapModalRun.guardName
            }</strong><br/>GPS: ${gLat.toFixed(5)}, ${gLng.toFixed(5)}`
          );
      }

      const activeBounds =
        mapZoomFocus === 'QR' && qrBounds.length > 0
          ? qrBounds
          : mapZoomFocus === 'GUARD' && guardBounds.length > 0
          ? guardBounds
          : allBounds;

      if (activeBounds.length > 0 && !hasInitialFitRef.current && !userMovedMapRef.current) {
        map.fitBounds(activeBounds, { padding: [55, 55], maxZoom: 18 });
        hasInitialFitRef.current = true;
      }
    });

    return () => {
      isMounted = false;
    };
  }, [mapModalRun, liveTrail, rounds, mapZoomFocus]);

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


  // Helper: Export Single Patrol Run to Excel
  const exportSingleRunExcel = (run: PatrolRun) => {
    const summaryData = [{
      'Guard Name': run.guardName,
      'Employee Code': run.guardCode || '—',
      'Route Name': run.roundName,
      'Run Number': run.runNumber,
      'Date': run.displayDate,
      'Start Time': run.startTime ? new Date(run.startTime).toLocaleTimeString() : '—',
      'End Time': run.endTime ? new Date(run.endTime).toLocaleTimeString() : '—',
      'Duration': run.durationText,
      'Stops Verified': run.verifiedStopsCount,
      'Total Stops': run.totalRouteStops,
      'Compliance %': run.totalRouteStops > 0 ? Math.round((run.verifiedStopsCount / run.totalRouteStops) * 100) + '%' : '0%',
      'Status': run.status
    }];

    const scanLogsData = (run.scans || []).map((s, idx) => ({
      'Scan #': idx + 1,
      'Checkpoint Name': s.checkpoint_name || '—',
      'Scan Time': s.scan_time ? new Date(s.scan_time).toLocaleString() : '—',
      'Verified': s.is_verified ? 'Yes' : 'No',
      'Distance (m)': s.distance_meters != null ? Number(s.distance_meters).toFixed(1) : '—',
      'Guard Lat': s.guard_lat || '—',
      'Guard Lng': s.guard_lng || '—'
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsScans = XLSX.utils.json_to_sheet(scanLogsData.length > 0 ? scanLogsData : [{ 'Status': 'No scans recorded' }]);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Guard Summary');
    XLSX.utils.book_append_sheet(wb, wsScans, 'Checkpoint Scans');

    const cleanGuard = (run.guardName || 'Guard').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeDate = (run.dateKey || 'today').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Patrol_Report_${cleanGuard}_${safeDate}.xlsx`);
  };

  // Helper: Export Master Consolidated Excel for Filtered Runs
  const exportMasterExcel = () => {
    if (filteredRuns.length === 0) {
      alert('No patrol data available for the selected filters.');
      return;
    }

    const summaryRows = filteredRuns.map((run) => ({
      'Route Name': run.roundName,
      'Run #': run.runNumber,
      'Date': run.displayDate,
      'Guard Name': run.guardName,
      'Employee Code': run.guardCode || '—',
      'Start Time': run.startTime ? new Date(run.startTime).toLocaleTimeString() : '—',
      'End Time': run.endTime ? new Date(run.endTime).toLocaleTimeString() : '—',
      'Duration': run.durationText,
      'Stops Verified': run.verifiedStopsCount,
      'Total Stops': run.totalRouteStops,
      'Compliance %': run.totalRouteStops > 0 ? Math.round((run.verifiedStopsCount / run.totalRouteStops) * 100) + '%' : '0%',
      'Status': run.status
    }));

    const allScansRows: any[] = [];
    filteredRuns.forEach((run) => {
      (run.scans || []).forEach((s) => {
        allScansRows.push({
          'Date': run.displayDate,
          'Route Name': run.roundName,
          'Run #': run.runNumber,
          'Guard Name': run.guardName,
          'Employee Code': run.guardCode || '—',
          'Checkpoint Name': s.checkpoint_name || '—',
          'Scan Time': s.scan_time ? new Date(s.scan_time).toLocaleString() : '—',
          'Verified': s.is_verified ? 'Yes' : 'No',
          'Distance (m)': s.distance_meters != null ? Number(s.distance_meters).toFixed(1) : '—',
          'Guard Lat': s.guard_lat || '—',
          'Guard Lng': s.guard_lng || '—'
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsAllScans = XLSX.utils.json_to_sheet(allScansRows.length > 0 ? allScansRows : [{ 'Status': 'No scans recorded' }]);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Plant Patrol Summary');
    XLSX.utils.book_append_sheet(wb, wsAllScans, 'All Checkpoint Scans');

    const dateTag = selectedDate === 'ALL' ? 'All_Dates' : selectedDate;
    XLSX.writeFile(wb, `Master_Patrol_Report_${dateTag}.xlsx`);
  };

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'ACTIVE' | 'PENDING'>('ALL');
  const [guardSearch, setGuardSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const scopeRuns = useMemo(() => {
    return allPatrolRuns.filter((run) => {
      if (selectedRouteFilter !== 'ALL' && run.roundId !== selectedRouteFilter) return false;
      if (selectedDate !== 'ALL' && run.dateKey !== selectedDate) return false;
      return true;
    });
  }, [allPatrolRuns, selectedRouteFilter, selectedDate]);

  const filteredRuns = useMemo(() => {
    return scopeRuns.filter((run) => {
      if (statusFilter === 'COMPLETED' && run.status !== 'COMPLETED') return false;
      if (statusFilter === 'ACTIVE' && !['IN_PROGRESS', 'PAUSED', 'PARTIAL'].includes(run.status)) return false;
      if (statusFilter === 'PENDING' && run.status !== 'PENDING') return false;
      if (guardSearch.trim()) {
        const q = guardSearch.trim().toLowerCase();
        const hay = `${run.guardName || ''} ${run.guardCode || ''} ${run.roundName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopeRuns, statusFilter, guardSearch]);

  const totalRecords = filteredRuns.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRuns = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRuns.slice(start, start + pageSize);
  }, [filteredRuns, safePage, pageSize]);

  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push('ellipsis');
      const start = Math.max(2, safePage - 1);
      const end = Math.min(totalPages - 1, safePage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safePage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  }, [safePage, totalPages]);

  const startItem = totalRecords === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(totalRecords, safePage * pageSize);

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

  const completedCount = scopeRuns.filter((r) => r.status === 'COMPLETED').length;
  const inProgressCount = scopeRuns.filter((r) => ['IN_PROGRESS', 'PAUSED', 'PARTIAL'].includes(r.status)).length;
  const totalScansCount = scopeRuns.reduce((acc, r) => acc + r.scans.length, 0);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 font-sans text-xs text-slate-800">
      <div className="mx-auto max-w-[1600px] space-y-5">
        {/* Tactical Calm Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Patrol Audit &amp; Live Route Tracking
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Compare expected QR checkpoint locations against actual guard capture GPS coordinates and live walking trails.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={exportMasterExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>

            <button
              type="button"
              onClick={fetchAllReportsData}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-sky-400 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Full-Dataset Summary KPI Strip (Clickable Quick Filters) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('ALL');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusFilter === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold uppercase ${statusFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Patrol Sessions
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold">{scopeRuns.length}</div>
            </div>
            <Layers className={`h-5 w-5 ${statusFilter === 'ALL' ? 'text-sky-400' : 'text-slate-400'}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('COMPLETED');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusFilter === 'COMPLETED'
                ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-emerald-700">Completed Runs</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{completedCount}</div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('ACTIVE');
              setPage(1);
            }}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              statusFilter === 'ACTIVE'
                ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-amber-700">Active / Partial Runs</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{inProgressCount}</div>
            </div>
            <Clock className="h-5 w-5 text-amber-600" />
          </button>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <div className="text-[11px] font-bold uppercase text-blue-700">Total QR Scans</div>
              <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{totalScansCount}</div>
            </div>
            <Shield className="h-5 w-5 text-blue-600" />
          </div>
        </div>

        {/* Clean Filter & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { key: 'ALL', label: 'All Sessions' },
              { key: 'COMPLETED', label: 'Completed' },
              { key: 'ACTIVE', label: 'In Progress / Partial' },
              { key: 'PENDING', label: 'Not Started' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <div className="mx-1 h-4 w-px bg-slate-200" />

            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedRouteFilter}
                onChange={(e) => {
                  setSelectedRouteFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">All Patrol Routes</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.checkpoints?.length || 0} stops)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">All Dates</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-brand-500 focus-within:bg-white">
            <Search className="mr-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter guard, ID, or route..."
              value={guardSearch}
              onChange={(e) => {
                setGuardSearch(e.target.value);
                setPage(1);
              }}
              className="w-48 bg-transparent text-xs text-slate-800 outline-none sm:w-56"
            />
            {guardSearch && (
              <button type="button" onClick={() => setGuardSearch('')} className="text-slate-400 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Wide Proportional Patrol Runs Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 pl-5 pr-3">Route / Site Name</th>
                  <th className="w-[155px] px-3 py-3.5">Date &amp; Session</th>
                  <th className="w-[180px] px-3 py-3.5">Guard</th>
                  <th className="w-[115px] px-3 py-3.5">Start Time</th>
                  <th className="w-[140px] px-3 py-3.5">End Time</th>
                  <th className="w-[130px] px-3 py-3.5">Duration</th>
                  <th className="w-[125px] px-3 py-3.5">Stops</th>
                  <th className="w-[130px] px-3 py-3.5">Status</th>
                  <th className="w-[180px] py-3.5 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={9} className="px-5 py-3.5">
                        <div className="h-5 w-full animate-pulse rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : paginatedRuns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                      No patrol sessions found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  paginatedRuns.map((run) => {
                    const isSelected = inspectedRun?.runId === run.runId;
                    return (
                      <tr
                        key={run.runId}
                        onClick={() => setSelectedRunId(run.runId)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/90'
                        }`}
                      >
                        <td className="py-3.5 pl-5 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{run.roundName}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {run.totalRouteStops} {run.totalRouteStops === 1 ? 'stop' : 'stops'}
                            </span>
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5">
                          {run.status === 'PENDING' ? (
                            <span className="italic text-slate-400">No scans yet</span>
                          ) : (
                            <div>
                              <div className="font-bold text-slate-800">{run.displayDate}</div>
                              <div className="text-[10px] font-semibold text-blue-600">
                                Patrol Run #{run.runNumber}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <div>
                              <div className="font-semibold text-slate-800">{run.guardName}</div>
                              {run.guardCode && (
                                <div className="font-mono text-[10px] text-slate-400">
                                  ID: {run.guardCode}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-slate-700">
                          {run.startTime ? new Date(run.startTime).toLocaleTimeString() : '—'}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-slate-700">
                          {run.endTime
                            ? run.status === 'COMPLETED'
                              ? new Date(run.endTime).toLocaleTimeString()
                              : `${new Date(run.endTime).toLocaleTimeString()} (Latest)`
                            : '—'}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                            <Timer className="h-3 w-3 text-blue-600" />
                            {run.durationText}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5">
                          <span className="font-mono font-bold text-slate-800">
                            {run.verifiedStopsCount} / {run.totalRouteStops}
                          </span>
                          <span className="ml-1 text-slate-400">stops</span>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5">
                          {run.status === 'COMPLETED' && (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-700">
                              COMPLETED
                            </span>
                          )}
                          {run.status === 'PAUSED' && (
                            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-extrabold text-sky-700">
                              PAUSED
                            </span>
                          )}
                          {run.status === 'PARTIAL' && (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[10px] font-extrabold text-orange-700">
                                PARTIALLY ENDED
                              </span>
                              {run.handoverNote && (
                                <span className="text-[9px] font-medium text-orange-600">
                                  {run.handoverNote}
                                </span>
                              )}
                            </div>
                          )}
                          {run.status === 'IN_PROGRESS' && (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-800">
                              IN PROGRESS
                            </span>
                          )}
                          {run.status === 'PENDING' && (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-extrabold text-slate-500">
                              NOT STARTED
                            </span>
                          )}
                        </td>

                        <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMapModalRun(run);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              <Navigation className="h-3 w-3" /> Live Map
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRunId(run.runId);
                              }}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                                isSelected
                                  ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              Inspect <ChevronRight className="h-3.5 w-3.5" />
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

          {/* Numbered Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                Showing <strong className="font-mono text-slate-900">{startItem}</strong>–
                <strong className="font-mono text-slate-900">{endItem}</strong> of{' '}
                <strong className="font-mono text-slate-900">{totalRecords}</strong> patrol sessions
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
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
                disabled={safePage <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>

              {pageNumbers.map((pNum, idx) =>
                pNum === 'ellipsis' ? (
                  <span key={`el-${idx}`} className="px-2 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold transition ${
                      safePage === pNum
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
                disabled={safePage >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
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
                  const resolved = resolveGuardCaptureCoords(scan);
                  const gLat = resolved.lat;
                  const gLng = resolved.lng;

                  const computedDist =
                    scan.distance_meters !== undefined && Number(scan.distance_meters) > 0
                      ? Math.round(Number(scan.distance_meters))
                      : expLat !== 0 && gLat !== 0
                      ? Math.round(getDistanceMeters(gLat, gLng, expLat, expLng))
                      : 0;

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

                      {/* Side-by-side Expected QR GPS vs Decoded Guard Capture GPS */}
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
                            {gLat !== 0
                              ? `${gLat.toFixed(5)}, ${gLng.toFixed(5)} (${computedDist}m offset)`
                              : `Offset: ${computedDist}m`}
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
                  <Radio className={`w-4 h-4 ${liveTrail?.session?.status === 'ACTIVE' && liveTrail?.session?.last_ping_at && Date.now() - new Date(liveTrail.session.last_ping_at).getTime() <= 30000 ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
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
                  {' '}• Location: <strong className={liveTrail?.session?.status === 'ACTIVE' && liveTrail?.session?.last_ping_at && Date.now() - new Date(liveTrail.session.last_ping_at).getTime() <= 30000 ? 'text-emerald-300' : 'text-amber-300'}>{liveTrail?.session?.status === 'ACTIVE' && liveTrail?.session?.last_ping_at && Date.now() - new Date(liveTrail.session.last_ping_at).getTime() <= 30000 ? 'LIVE' : 'STALE / NOT UPDATING'}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Quick Zoom Switcher for Far-Away Captures */}
                <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px]">
                  <button
                    onClick={() => { userMovedMapRef.current = false; hasInitialFitRef.current = false; setMapZoomFocus('ALL'); }}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      mapZoomFocus === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Fit Both
                  </button>
                  <button
                    onClick={() => { userMovedMapRef.current = false; hasInitialFitRef.current = false; setMapZoomFocus('QR'); }}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      mapZoomFocus === 'QR' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Zoom QR Route
                  </button>
                  <button
                    onClick={() => { userMovedMapRef.current = false; hasInitialFitRef.current = false; setMapZoomFocus('GUARD'); }}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      mapZoomFocus === 'GUARD' ? 'bg-rose-600 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Zoom Guard GPS
                  </button>
                </div>

                <button
                  onClick={() => setAutoRefreshMap(!autoRefreshMap)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    autoRefreshMap
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {autoRefreshMap ? 'Auto-Refresh: ON' : 'Auto-Refresh: OFF'}
                </button>

                <button
                  onClick={() => fetchLiveTrailForRound(mapModalRun.roundId)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTrail ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

                <button
                  onClick={() => setMapModalRun(null)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

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