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
  
  const [selectedRound, setSelectedRound] = useState<PatrolRound | null>(null);
  const [roundScans, setRoundScans] = useState<CheckpointScanDetail[]>([]);
  const [scansLoading, setScansLoading] = useState<boolean>(false);
  const [mapOpen, setMapOpen] = useState<boolean>(false);

  const [enlargedPhotos, setEnlargedPhotos] = useState<{
    checkpointName: string;
    selfieUrl?: string | null;
    locationPhotoUrl?: string | null;
  } | null>(null);

  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleSelectRound = async (round: PatrolRound) => {
    setSelectedRound(round);
    setScansLoading(true);
    const roundId = (round as any).round_id || (round as any).id;
    try {
      const res = await fetch(`${API_BASE}/rounds/${roundId}/scans`);
      const data = await res.json();
      setRoundScans(data.scans || []);
    } catch (err) {
      console.error('Failed to fetch scans', err);
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
      'Round ID': r.round_id || r.id || 'N/A',
      'Site': r.sites?.site_name || 'Main Campus',
      'Guard Name': r.guards?.full_name || r.guard_name || 'Assigned Guard',
      'Employee Code': r.guards?.employee_code || r.guard_id || 'N/A',
      'Start Time': r.started_at || r.start_time ? new Date(r.started_at || r.start_time).toLocaleString() : 'N/A',
      'End Time': r.ended_at || r.end_time ? new Date(r.ended_at || r.end_time).toLocaleString() : 'In Progress',
      'Status': r.status || 'IN_PROGRESS'
    }));

    triggerDownload(rows, 'Rakshak_Patrol_Summary', 'Rounds Summary', format);
  };

  const exportInspectedRoundAudit = (format: 'xlsx' | 'csv') => {
    if (!roundScans.length || !selectedRound) return;

    const roundId = (selectedRound as any).round_id || (selectedRound as any).id || 'Round';
    const guardName = (selectedRound as any).guards?.full_name || (selectedRound as any).guard_name || 'N/A';
    const siteName = (selectedRound as any).sites?.site_name || 'Main Campus';

    const rows = roundScans.map((s: any, idx: number) => ({
      'Stop #': idx + 1,
      'Patrol Round ID': roundId,
      'Site': siteName,
      'Guard Name': guardName,
      'Employee Code': (selectedRound as any).guards?.employee_code || 'N/A',
      'Checkpoint': s.checkpoint_name || s.checkpoint_id || 'N/A',
      'Checkpoint ID': s.checkpoint_id || 'N/A',
      'Scanned At': s.scanned_at || s.scan_time ? new Date(s.scanned_at || s.scan_time).toLocaleString() : 'N/A',
      'Verification Status': s.is_gps_verified ? 'VERIFIED' : 'DRIFT_FLAGGED',
      'Distance Drift (m)': s.calculated_distance_m ?? s.distance_meters ?? 'N/A',
      'Guard Lat': s.guard_lat ?? 'N/A',
      'Guard Lng': s.guard_lng ?? 'N/A',
      'Expected Lat': s.expected_lat ?? 'N/A',
      'Expected Lng': s.expected_lng ?? 'N/A',
      'Selfie URL': getSecureMediaUrl(s.selfie_url || s.photo_url) || '',
      'Location Photo URL': getSecureMediaUrl(s.location_photo_url || s.photo_url) || '',
      'Remarks': s.remarks || ''
    }));

    const shortId = String(roundId).substring(0, 8);
    triggerDownload(rows, `Rakshak_Round_Audit_${shortId}`, 'Checkpoint Audits', format);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Top Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Patrol Reports & Compliance</h1>
            <p className="text-sm text-gray-500">Audit guard presence, GPS drift, and multi-factor photo proofs.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fetchRounds(page)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>

            {selectedRound && (
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition"
              >
                <MapPin className="h-4 w-4" /> View Map Audit
              </button>
            )}

            {/* Multi-Format Export Dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setExportMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <FileSpreadsheet className="h-4 w-4" /> 
                <span>Export</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {exportMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-xl z-50 text-xs">
                  <div className="px-3 py-1 font-bold uppercase tracking-wider text-gray-400 text-[10px]">
                    Master Rounds History
                  </div>
                  <button
                    type="button"
                    onClick={() => exportMasterRoundsSummary('xlsx')}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-gray-700 flex items-center justify-between"
                  >
                    <span>All Rounds Summary</span>
                    <span className="font-semibold text-emerald-700">.XLSX</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportMasterRoundsSummary('csv')}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-gray-700 flex items-center justify-between"
                  >
                    <span>All Rounds Summary</span>
                    <span className="font-semibold text-emerald-700">.CSV</span>
                  </button>

                  {selectedRound && (
                    <>
                      <div className="border-t my-1 border-gray-100" />
                      <div className="px-3 py-1 font-bold uppercase tracking-wider text-gray-400 text-[10px]">
                        Inspected Round Audits
                      </div>
                      <button
                        type="button"
                        onClick={() => exportInspectedRoundAudit('xlsx')}
                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-gray-700 flex items-center justify-between"
                      >
                        <span>Checkpoint Proofs</span>
                        <span className="font-semibold text-emerald-700">.XLSX</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => exportInspectedRoundAudit('csv')}
                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-gray-700 flex items-center justify-between"
                      >
                        <span>Checkpoint Proofs</span>
                        <span className="font-semibold text-emerald-700">.CSV</span>
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
            <h2 className="text-base font-semibold text-gray-800">Patrol Rounds History</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-6 py-3">Site</th>
                  <th className="px-6 py-3">Guard</th>
                  <th className="px-6 py-3">Start Time</th>
                  <th className="px-6 py-3">End Time</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">Loading patrol rounds...</td>
                  </tr>
                ) : rounds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">No patrol rounds logged for this period.</td>
                  </tr>
                ) : (
                  rounds.map((round: any) => {
                    const roundId = round.round_id || round.id;
                    const isSelected = selectedRound && ((selectedRound as any).round_id === roundId || (selectedRound as any).id === roundId);
                    const startTime = round.started_at || round.start_time;
                    const endTime = round.ended_at || round.end_time;

                    return (
                      <tr 
                        key={roundId} 
                        className={`transition hover:bg-gray-50 ${isSelected ? 'bg-blue-50/60' : ''}`}
                      >
                        <td className="px-6 py-4 font-medium text-gray-900">{round.sites?.site_name ?? 'Main Campus'}</td>
                        <td className="px-6 py-4">
                          {round.guards?.full_name || round.guard_name || 'Assigned Guard'} 
                          <span className="block text-xs text-gray-400">ID: {round.guards?.employee_code || round.guard_id || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4">{startTime ? new Date(startTime).toLocaleString() : '—'}</td>
                        <td className="px-6 py-4">{endTime ? new Date(endTime).toLocaleString() : 'In Progress'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            round.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {round.status || 'IN_PROGRESS'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSelectRound(round)}
                            className="inline-flex items-center gap-1 rounded bg-white px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 transition"
                          >
                            Inspect <ChevronRight className="h-3 w-3" />
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
          <div className="flex items-center justify-between border-t px-6 py-3">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages} ({totalCount} total rounds)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border p-1 text-gray-600 disabled:opacity-40 hover:bg-gray-100 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border p-1 text-gray-600 disabled:opacity-40 hover:bg-gray-100 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Selected Round Drill-Down */}
        {selectedRound && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Checkpoints Scanned ({roundScans.length})
              </h2>
              <span className="text-xs text-gray-500">
                Round ID: {(selectedRound as any).round_id || (selectedRound as any).id}
              </span>
            </div>

            {scansLoading ? (
              <p className="py-8 text-center text-sm text-gray-400">Loading checkpoints and proof photos...</p>
            ) : roundScans.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No checkpoints recorded for this round.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {roundScans.map((scan: any, idx: number) => {
                  const scanTime = scan.scanned_at || scan.scan_time;
                  const distanceMeters = scan.calculated_distance_m ?? scan.distance_meters;
                  const selfie = getSecureMediaUrl(scan.selfie_url || scan.photo_url);
                  const locationPhoto = getSecureMediaUrl(scan.location_photo_url || scan.photo_url);
                  const checkpointName = scan.checkpoint_name || scan.checkpoint_id;

                  return (
                    <div key={scan.scan_id || scan.id || idx} className="rounded-lg border border-gray-200 p-4 bg-white">
                      <div className="mb-3 flex items-start justify-between">
                        <div>
                          <span className="text-xs font-semibold text-blue-600">Stop #{idx + 1}</span>
                          <h3 className="font-medium text-gray-900">{checkpointName}</h3>
                          <p className="text-xs text-gray-400">{scanTime ? new Date(scanTime).toLocaleTimeString() : '—'}</p>
                        </div>
                        <div>
                          {scan.is_gps_verified ? (
                            <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700">
                              <CheckCircle2 className="h-3 w-3" /> Verified (≤50m)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Drift Flagged ({distanceMeters ? Number(distanceMeters).toFixed(0) : '—'}m)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Clickable Side-by-Side Photos */}
                      <div 
                        onClick={() => {
                          if (selfie || locationPhoto) {
                            setEnlargedPhotos({
                              checkpointName,
                              selfieUrl: selfie,
                              locationPhotoUrl: locationPhoto,
                            });
                          }
                        }}
                        className="group relative grid grid-cols-2 gap-3 cursor-pointer rounded-lg p-1 transition hover:bg-slate-50"
                        title="Click to view full comparison"
                      >
                        <div>
                          <span className="mb-1 block text-xs font-medium text-gray-500">Guard Selfie</span>
                          <div className="aspect-square overflow-hidden rounded-md bg-gray-100 border border-gray-200">
                            {selfie ? (
                              <img 
                                src={selfie} 
                                alt="Guard Selfie" 
                                className="h-full w-full object-cover transition group-hover:scale-105" 
                                loading="lazy" 
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-gray-400">No Selfie</div>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="mb-1 block text-xs font-medium text-gray-500">Location Photo</span>
                          <div className="aspect-square overflow-hidden rounded-md bg-gray-100 border border-gray-200">
                            {locationPhoto ? (
                              <img 
                                src={locationPhoto} 
                                alt="Location Proof" 
                                className="h-full w-full object-cover transition group-hover:scale-105" 
                                loading="lazy" 
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-gray-400">No Location Photo</div>
                            )}
                          </div>
                        </div>

                        {(selfie || locationPhoto) && (
                          <div className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">
                            <Maximize2 className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>

                      {scan.remarks && (
                        <div className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-600">
                          <strong>Remarks:</strong> {scan.remarks}
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setEnlargedPhotos(null)}
          >
            <div 
              className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl transition"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Photo Verification
                  </h3>
                  <p className="text-xs text-gray-500">
                    Checkpoint: <span className="font-semibold text-gray-700">{enlargedPhotos.checkpointName}</span>
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setEnlargedPhotos(null)} 
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <span className="mb-2 block text-sm font-semibold text-gray-700">Guard Selfie</span>
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-slate-50">
                    {enlargedPhotos.selfieUrl ? (
                      <img 
                        src={enlargedPhotos.selfieUrl} 
                        alt="Guard Selfie" 
                        className="h-full w-full object-contain" 
                      />
                    ) : (
                      <span className="text-sm text-gray-400">No selfie recorded</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="mb-2 block text-sm font-semibold text-gray-700">Location Proof Photo</span>
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-slate-50">
                    {enlargedPhotos.locationPhotoUrl ? (
                      <img 
                        src={enlargedPhotos.locationPhotoUrl} 
                        alt="Location Proof" 
                        className="h-full w-full object-contain" 
                      />
                    ) : (
                      <span className="text-sm text-gray-400">No location photo recorded</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Leaflet Map Modal */}
        <PatrolMapModal
          isOpen={mapOpen}
          onClose={() => setMapOpen(false)}
          scans={roundScans}
          roundTitle={`Round #${String((selectedRound as any)?.round_id || (selectedRound as any)?.id || '').substring(0, 8)} - ${(selectedRound as any)?.guards?.full_name || (selectedRound as any)?.guard_name || 'Guard'}`}
        />
      </div>
    </div>
  );
};

export default ReportsPage;