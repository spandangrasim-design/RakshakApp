import * as XLSX from 'xlsx';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  UserCheck,
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
  let currentGuardId = '';

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

    // Check if new guard, new date, repeated checkpoint, or cycle gap
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
    currentGuardId = scan.guard_id;
    currentBucket.push(scan);
    seenCheckpoints.add(scan.checkpoint_id);
  }

  if (currentBucket.length > 0) {
    flushBucket(currentBucket, runs.length + 1);
  }

  return runs;
}

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
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              Pending
                            </span>
                          ) : run.status === 'COMPLETED' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Completed
                            </span>
                          ) : run.status === 'PAUSED' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                              Paused
                            </span>
                          ) : run.status === 'PARTIAL' ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                Partially Ended
                              </span>
                              {run.handoverNote && (
                                <span className="text-[10px] text-orange-600 font-medium">
                                  {run.handoverNote}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              In Progress
                            </span>
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

              <div className="flex flex-wrap items-center gap-2">
                {/* Quick Zoom Switcher for Far-Away Captures */}
                <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px]">
                  <button
                    onClick={() => setMapZoomFocus('ALL')}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      mapZoomFocus === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Fit Both
                  </button>
                  <button
                    onClick={() => setMapZoomFocus('QR')}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      mapZoomFocus === 'QR' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Zoom QR Route
                  </button>
                  <button
                    onClick={() => setMapZoomFocus('GUARD')}
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