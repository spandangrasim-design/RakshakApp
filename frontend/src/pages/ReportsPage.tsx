import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  MapPin, 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown,
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw,
  X,
  Maximize2
} from 'lucide-react';
import { PatrolRound, CheckpointScanDetail } from '../types/patrol';
import { PatrolMapModal } from '../components/reports/PatrolMapModal';
import { getSecureMediaUrl } from '../utils/secureMedia';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

export const ReportsPage: React.FC = () => {
  const [rounds, setRounds] = useState<PatrolRound[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  
  // Selected Round Drill-Down State
  const [selectedRound, setSelectedRound] = useState<PatrolRound | null>(null);
  const [roundScans, setRoundScans] = useState<CheckpointScanDetail[]>([]);
  const [scansLoading, setScansLoading] = useState<boolean>(false);
  const [mapOpen, setMapOpen] = useState<boolean>(false);

  // Enlarged Photo Lightbox State (Supports both photos)
  const [enlargedPhotos, setEnlargedPhotos] = useState<{
    checkpointName: string;
    selfieUrl?: string | null;
    locationPhotoUrl?: string | null;
    scannedAt?: string;
    driftMeters?: number | string;
    isVerified?: boolean;
  } | null>(null);

  // Export Menu State
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Patrol Rounds (Paginated)
  const fetchRounds = async (targetPage: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/rounds?page=${targetPage}&pageSize=${pageSize}`);
      const data = await res.json();
      
      const items = data.rounds || data.items || [];
      setRounds(items);
      setTotalCount(data.total || items.length);
    } catch (err) {
      console.error('Failed to fetch rounds', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds(page);
  }, [page]);

  const getRouteDisplayName = (round: any) => {
    if (!round) return 'Patrol Route';
    return round?.name || round?.round_name || round?.title || round?.sites?.site_name || 'Patrol Route';
  };

  // Fetch Scans for Selected Round with dual-endpoint fallback
  const handleSelectRound = async (round: PatrolRound) => {
    setSelectedRound(round);
    setScansLoading(true);
    const roundId = (round as any)?.id || (round as any)?.round_id;

    try {
      const res = await fetch(`${API_BASE}/rounds/${roundId}/scans`);
      const data = await res.json();
      
      if (data.success && Array.isArray(data.scans) && data.scans.length > 0) {
        setRoundScans(data.scans);
      } else {
        const allScansRes = await fetch(`${API_BASE}/scans`);
        const allScansData = await allScansRes.json();
        const allScans = allScansData.scans || [];

        const roundCheckpoints = (round as any)?.checkpoints || [];
        const checkpointIds = new Set(roundCheckpoints.map((cp: any) => cp?.id || cp?.checkpoint_id));

        const matchedScans = allScans
          .filter((s: any) => s?.round_id === roundId || checkpointIds.has(s?.checkpoint_id))
          .map((s: any) => {
            const matchedCp = roundCheckpoints.find(
              (cp: any) => (cp?.id || cp?.checkpoint_id) === s?.checkpoint_id
            );
            return {
              ...s,
              checkpoint_name: matchedCp?.name || s?.checkpoint_name || s?.checkpoint_id,
              master_lat: matchedCp?.lat ? parseFloat(matchedCp.lat) : (s?.expected_lat ?? s?.master_lat),
              master_lng: matchedCp?.lng ? parseFloat(matchedCp.lng) : (s?.expected_lng ?? s?.master_lng),
              scan_lat: s?.guard_lat ?? s?.scan_lat,
              scan_lng: s?.guard_lng ?? s?.scan_lng,
              is_gps_verified: s?.is_gps_verified ?? (s?.status === 'VERIFIED'),
              calculated_distance_m: s?.calculated_distance_m ?? s?.distance_meters ?? 0
            };
          });

        setRoundScans(matchedScans);
      }
    } catch (err) {
      console.error('Failed to fetch scans for round:', err);
      setRoundScans([]);
    } finally {
      setScansLoading(false);
    }
  };

  const triggerDownload = (dataRows: any[], fileNamePrefix: string, sheetName: string, format: 'xlsx' | 'csv') => {
    if (!dataRows || dataRows.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `${fileNamePrefix}_${dateStamp}.${format}`;

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, fileName);
    }
    setExportMenuOpen(false);
  };

  const exportMasterRoundsSummary = (format: 'xlsx' | 'csv') => {
    if (!rounds.length) return;

    const rows = rounds.map((r: any) => ({
      'Round ID': r?.round_id || r?.id || 'N/A',
      'Route / Site': getRouteDisplayName(r),
      'Guard Name': r?.guards?.full_name || r?.guard_name || 'Assigned Guard',
      'Employee Code': r?.guards?.employee_code || r?.guard_id || 'N/A',
      'Start Time': r?.started_at || r?.start_time ? new Date(r.started_at || r.start_time).toLocaleString() : 'N/A',
      'End Time': r?.ended_at || r?.end_time ? new Date(r.ended_at || r.end_time).toLocaleString() : 'In Progress',
      'Status': r?.status || 'IN_PROGRESS'
    }));

    triggerDownload(rows, 'Rakshak_Patrol_Summary', 'Rounds Summary', format);
  };

  const exportInspectedRoundAudit = (format: 'xlsx' | 'csv') => {
    if (!roundScans.length || !selectedRound) return;

    const roundId = (selectedRound as any)?.round_id || (selectedRound as any)?.id || 'Round';
    const routeName = getRouteDisplayName(selectedRound);
    const guardName = (selectedRound as any)?.guards?.full_name || (selectedRound as any)?.guard_name || 'N/A';

    const rows = roundScans.map((s: any, idx: number) => ({
      'Stop #': idx + 1,
      'Patrol Round ID': roundId,
      'Route Name': routeName,
      'Guard Name': guardName,
      'Employee Code': (selectedRound as any)?.guards?.employee_code || 'N/A',
      'Checkpoint': s?.checkpoint_name || s?.checkpoint_id || 'N/A',
      'Checkpoint ID': s?.checkpoint_id || 'N/A',
      'Scanned At': s?.scanned_at || s?.scan_time ? new Date(s.scanned_at || s.scan_time).toLocaleString() : 'N/A',
      'Verification Status': s?.is_gps_verified ? 'VERIFIED' : 'DRIFT_FLAGGED',
      'Distance Drift (m)': s?.calculated_distance_m ?? s?.distance_meters ?? 'N/A',
      'Guard Lat': s?.guard_lat ?? s?.scan_lat ?? 'N/A',
      'Guard Lng': s?.guard_lng ?? s?.scan_lng ?? 'N/A',
      'Expected Lat': s?.expected_lat ?? s?.master_lat ?? 'N/A',
      'Expected Lng': s?.expected_lng ?? s?.master_lng ?? 'N/A',
      'Guard Selfie URL': getSecureMediaUrl(s?.selfie_url) || '',
      'Location Photo URL': getSecureMediaUrl(s?.location_photo_url || s?.photo_url) || '',
      'Remarks': s?.remarks || ''
    }));

    const shortId = String(roundId).substring(0, 8);
    triggerDownload(rows, `Rakshak_Round_Audit_${shortId}`, 'Checkpoint Audits', format);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="mx-auto max-w-7xl">
        {/* Top Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Patrol Reports & Compliance</h1>
            <p className="text-base text-gray-600 mt-1">Audit guard presence, GPS drift, and multi-factor photo proofs.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fetchRounds(page)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>

            {selectedRound && (
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
              >
                <MapPin className="h-4 w-4" /> View Map Audit
              </button>
            )}

            {/* Multi-Format Export Dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setExportMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <FileSpreadsheet className="h-4 w-4" /> 
                <span>Export</span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {exportMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-xl z-50 text-sm">
                  <div className="px-4 py-1.5 font-bold uppercase tracking-wider text-gray-400 text-xs">
                    Master Rounds History
                  </div>
                  <button
                    type="button"
                    onClick={() => exportMasterRoundsSummary('xlsx')}
                    className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-gray-700 flex items-center justify-between"
                  >
                    <span>All Rounds Summary</span>
                    <span className="font-bold text-emerald-700">.XLSX</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportMasterRoundsSummary('csv')}
                    className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-gray-700 flex items-center justify-between"
                  >
                    <span>All Rounds Summary</span>
                    <span className="font-bold text-emerald-700">.CSV</span>
                  </button>

                  {selectedRound && (
                    <>
                      <div className="border-t my-1 border-gray-100" />
                      <div className="px-4 py-1.5 font-bold uppercase tracking-wider text-gray-400 text-xs">
                        Inspected Round Audits
                      </div>
                      <button
                        type="button"
                        onClick={() => exportInspectedRoundAudit('xlsx')}
                        className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-gray-700 flex items-center justify-between"
                      >
                        <span>Checkpoint Proofs</span>
                        <span className="font-bold text-emerald-700">.XLSX</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => exportInspectedRoundAudit('csv')}
                        className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-gray-700 flex items-center justify-between"
                      >
                        <span>Checkpoint Proofs</span>
                        <span className="font-bold text-emerald-700">.CSV</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Master Patrol Rounds Table */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-bold text-gray-800">Patrol Rounds History</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-6 py-3.5">Route / Site Name</th>
                  <th className="px-6 py-3.5">Guard</th>
                  <th className="px-6 py-3.5">Start Time</th>
                  <th className="px-6 py-3.5">End Time</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-base text-gray-400">Loading patrol rounds...</td>
                  </tr>
                ) : rounds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-base text-gray-400">No patrol rounds logged for this period.</td>
                  </tr>
                ) : (
                  rounds.map((round: any) => {
                    const roundId = round?.round_id || round?.id;
                    const isSelected = selectedRound && ((selectedRound as any)?.round_id === roundId || (selectedRound as any)?.id === roundId);
                    const startTime = round?.started_at || round?.start_time;
                    const endTime = round?.ended_at || round?.end_time;
                    const routeName = getRouteDisplayName(round);
                    const checkpointCount = Array.isArray(round?.checkpoints) ? round.checkpoints.length : 0;

                    return (
                      <tr 
                        key={roundId} 
                        className={`transition hover:bg-gray-50 ${isSelected ? 'bg-blue-50/70' : ''}`}
                      >
                        <td className="px-6 py-4 font-bold text-gray-900 text-base">
                          {routeName}
                          {checkpointCount > 0 && (
                            <span className="ml-2.5 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                              {checkpointCount} stops
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-semibold text-gray-900">{round?.guards?.full_name || round?.guard_name || 'Assigned Guard'}</span>
                          <span className="block text-xs font-medium text-gray-500">ID: {round?.guards?.employee_code || round?.guard_id || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-600">{startTime ? new Date(startTime).toLocaleString() : '—'}</td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-600">{endTime ? new Date(endTime).toLocaleString() : 'In Progress'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            round?.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {round?.status || 'IN_PROGRESS'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSelectRound(round)}
                            className="inline-flex items-center gap-1 rounded-md bg-white px-3.5 py-1.5 text-xs font-bold text-blue-700 border border-blue-300 hover:bg-blue-50 transition"
                          >
                            Inspect <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between border-t px-6 py-3.5">
            <span className="text-sm font-medium text-gray-600">
              Page {page} of {totalPages} ({totalCount} total rounds)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border p-1.5 text-gray-600 disabled:opacity-40 hover:bg-gray-100 transition"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border p-1.5 text-gray-600 disabled:opacity-40 hover:bg-gray-100 transition"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Selected Round Drill-Down (Side-by-Side Dual Photo Verification) */}
        {selectedRound && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-gray-900">
                  Checkpoints Scanned ({roundScans.length})
                </h2>
                <p className="text-sm font-medium text-gray-600 mt-0.5">
                  Route: <span className="font-bold text-blue-700">{getRouteDisplayName(selectedRound)}</span>
                </p>
              </div>
              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2.5 py-1 rounded border">
                Round ID: {(selectedRound as any)?.round_id || (selectedRound as any)?.id}
              </span>
            </div>

            {scansLoading ? (
              <p className="py-10 text-center text-base text-gray-400">Loading checkpoint verification proofs...</p>
            ) : roundScans.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                No checkpoint scans recorded for this route yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {roundScans.map((scan: any, idx: number) => {
                  const scanTime = scan?.scanned_at || scan?.scan_time;
                  const distanceMeters = scan?.calculated_distance_m ?? scan?.distance_meters;
                  const isVerified = scan?.is_gps_verified ?? (scan?.status === 'VERIFIED');
                  
                  // Extract individual photos
                  const rawSelfie = scan?.selfie_url;
                  const rawLocation = scan?.location_photo_url || scan?.photo_url;

                  const selfieUrl = getSecureMediaUrl(rawSelfie);
                  const locationUrl = getSecureMediaUrl(rawLocation);
                  
                  // Determine if we have two genuine distinct photos or just one
                  const hasTwoDistinctPhotos = Boolean(selfieUrl && locationUrl && selfieUrl !== locationUrl);
                  const checkpointName = scan?.checkpoint_name || scan?.checkpoint_id || `Stop #${idx + 1}`;

                  return (
                    <div key={scan?.scan_id || scan?.id || idx} className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm flex flex-col justify-between">
                      <div>
                        {/* Header: Stop # and GPS Status */}
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-700">Stop #{idx + 1}</span>
                            <h3 className="font-bold text-gray-900 text-base leading-tight mt-0.5">{checkpointName}</h3>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">
                              {scanTime ? new Date(scanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                            </p>
                          </div>
                          <div>
                            {isVerified ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 border border-green-200 whitespace-nowrap">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200 whitespace-nowrap">
                                <AlertTriangle className="h-3.5 w-3.5" /> Drift ({distanceMeters ? Number(distanceMeters).toFixed(0) : '—'}m)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Side-by-Side Dual Photo Container with object-contain (no edge crop) */}
                        <div 
                          onClick={() => {
                            if (selfieUrl || locationUrl) {
                              setEnlargedPhotos({
                                checkpointName,
                                selfieUrl: hasTwoDistinctPhotos ? selfieUrl : null,
                                locationPhotoUrl: hasTwoDistinctPhotos ? locationUrl : (locationUrl || selfieUrl),
                                scannedAt: scanTime ? new Date(scanTime).toLocaleString() : undefined,
                                driftMeters: distanceMeters,
                                isVerified
                              });
                            }
                          }}
                          className="group relative cursor-pointer rounded-lg p-1 transition hover:bg-slate-50"
                          title="Click to compare full proof photos"
                        >
                          {hasTwoDistinctPhotos ? (
                            <div className="grid grid-cols-2 gap-3">
                              {/* 1. Guard Face Selfie */}
                              <div>
                                <span className="mb-1 block text-xs font-bold text-gray-700">1. Guard Selfie</span>
                                <div className="relative h-56 w-full flex items-center justify-center rounded-lg bg-slate-900 border border-gray-200 p-1 overflow-hidden">
                                  <img 
                                    src={selfieUrl!} 
                                    alt="Guard Face Proof" 
                                    className="h-full w-full object-contain transition group-hover:scale-[1.02]" 
                                    loading="lazy" 
                                  />
                                </div>
                              </div>

                              {/* 2. Checkpoint Tag / Location Proof */}
                              <div>
                                <span className="mb-1 block text-xs font-bold text-gray-700">2. Location Proof</span>
                                <div className="relative h-56 w-full flex items-center justify-center rounded-lg bg-slate-900 border border-gray-200 p-1 overflow-hidden">
                                  <img 
                                    src={locationUrl!} 
                                    alt="Checkpoint Location Proof" 
                                    className="h-full w-full object-contain transition group-hover:scale-[1.02]" 
                                    loading="lazy" 
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (locationUrl || selfieUrl) ? (
                            // Clean Single Photo View (If guard has only taken 1 photo so far)
                            <div className="relative h-56 w-full flex items-center justify-center rounded-lg bg-slate-900 border border-gray-200 p-1 overflow-hidden">
                              <img 
                                src={(locationUrl || selfieUrl)!} 
                                alt="Checkpoint Proof" 
                                className="h-full w-full object-contain transition group-hover:scale-[1.02]" 
                                loading="lazy" 
                              />
                              <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm shadow">
                                Checkpoint Proof
                              </span>
                            </div>
                          ) : (
                            <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs font-semibold text-gray-400">
                              No Photo Proof Captured
                            </div>
                          )}

                          {(selfieUrl || locationUrl) && (
                            <div className="absolute top-3 right-3 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100 z-10">
                              <Maximize2 className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      </div>

                      {scan?.remarks && (
                        <div className="mt-3 rounded-md bg-gray-50 p-2.5 text-xs text-gray-700 border border-gray-100">
                          <strong className="font-bold text-gray-900">Remark:</strong> {scan.remarks}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Enlarged Photo Lightbox Modal */}
        {enlargedPhotos && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={() => setEnlargedPhotos(null)}
          >
            <div 
              className="relative w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl transition max-h-[92vh] flex flex-col overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="mb-4 flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900">
                    Photo Verification Audit
                  </h3>
                  <p className="text-sm font-medium text-gray-600 mt-0.5">
                    Target: <span className="font-bold text-blue-700">{enlargedPhotos.checkpointName}</span>
                    {enlargedPhotos.scannedAt && <span className="ml-2 text-gray-500">({enlargedPhotos.scannedAt})</span>}
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setEnlargedPhotos(null)} 
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
                  aria-label="Close"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Modal Content: Dual Side-by-Side View vs Single View */}
              {enlargedPhotos.selfieUrl && enlargedPhotos.locationPhotoUrl ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Guard Face Selfie */}
                  <div>
                    <span className="mb-2 block text-sm font-bold text-gray-800">1. Guard Face Selfie</span>
                    <div className="relative flex h-[58vh] items-center justify-center overflow-hidden rounded-xl bg-slate-950 p-2 border border-gray-200">
                      <img 
                        src={enlargedPhotos.selfieUrl} 
                        alt="Guard Selfie" 
                        className="h-full w-full object-contain" 
                      />
                    </div>
                  </div>

                  {/* Right: Checkpoint Location Photo */}
                  <div>
                    <span className="mb-2 block text-sm font-bold text-gray-800">2. Location Proof Photo</span>
                    <div className="relative flex h-[58vh] items-center justify-center overflow-hidden rounded-xl bg-slate-950 p-2 border border-gray-200">
                      <img 
                        src={enlargedPhotos.locationPhotoUrl} 
                        alt="Location Proof" 
                        className="h-full w-full object-contain" 
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative flex h-[60vh] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950 p-2 border border-gray-200">
                  <img 
                    src={(enlargedPhotos.locationPhotoUrl || enlargedPhotos.selfieUrl)!} 
                    alt="Checkpoint Verification Proof" 
                    className="h-full w-full object-contain" 
                  />
                </div>
              )}

              {/* Status Footer Pill */}
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
                <div className="flex items-center gap-2">
                  {enlargedPhotos.isVerified ? (
                    <span className="inline-flex items-center gap-1 font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded border border-green-200">
                      <CheckCircle2 className="h-4 w-4" /> GPS & Timestamp Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                      <AlertTriangle className="h-4 w-4" /> Drift Flagged ({enlargedPhotos.driftMeters ?? '—'}m)
                    </span>
                  )}
                </div>
                <span className="text-gray-500 font-medium">Full Aspect Ratio Retained (Edge data uncropped)</span>
              </div>
            </div>
          </div>
        )}

        {/* Leaflet Map Modal */}
        <PatrolMapModal
          isOpen={mapOpen}
          onClose={() => setMapOpen(false)}
          scans={roundScans}
          roundTitle={selectedRound ? `Route: ${getRouteDisplayName(selectedRound)} (${roundScans.length} Checkpoints)` : 'Patrol Route Map'}
        />
      </div>
    </div>
  );
};

export default ReportsPage;