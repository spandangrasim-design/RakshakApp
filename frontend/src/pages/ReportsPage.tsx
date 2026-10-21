import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  MapPin, 
  ChevronRight, 
  ChevronLeft, 
  Eye, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import { PatrolRound, CheckpointScanDetail } from '../types/patrol';
import { PatrolMapModal } from '../components/reports/PatrolMapModal';

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

  // Fetch Patrol Rounds (Paginated)
  const fetchRounds = async (targetPage: number) => {
    try {
      setLoading(true);
      // In production, target your Cloudflare Worker: https://api.yourdomain.com/admin/reports/rounds
      const res = await fetch(`/api/admin/reports/rounds?page=${targetPage}&pageSize=${pageSize}`);
      const data = await res.json();
      setRounds(data.items || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch rounds', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds(page);
  }, [page]);

  // Fetch Scans for Selected Round
  const handleSelectRound = async (round: PatrolRound) => {
    setSelectedRound(round);
    setScansLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/rounds/${round.round_id}/scans`);
      const data = await res.json();
      setRoundScans(data.scans || []);
    } catch (err) {
      console.error('Failed to fetch scans', err);
    } finally {
      setScansLoading(false);
    }
  };

  // Export Filtered Rounds & Scans to Excel (.xlsx)
  const exportToExcel = () => {
    if (!roundScans.length || !selectedRound) return;

    const exportRows = roundScans.map((s) => ({
      'Patrol Round ID': selectedRound.round_id,
      'Site': selectedRound.sites?.site_name ?? 'N/A',
      'Guard Name': selectedRound.guards?.full_name ?? 'N/A',
      'Employee Code': selectedRound.guards?.employee_code ?? 'N/A',
      'Checkpoint': s.checkpoint_name,
      'Scanned At': new Date(s.scanned_at).toLocaleString(),
      'Status': s.status,
      'Distance Drift (m)': s.calculated_distance_m ?? 'N/A',
      'GPS Verified': s.is_gps_verified ? 'YES' : 'NO',
      'Remarks': s.remarks || '',
      'Selfie URL': s.selfie_url || '',
      'Location Photo URL': s.location_photo_url || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Patrol Audit');
    XLSX.writeFile(
      workbook, 
      `Patrol_Audit_${selectedRound.round_id.substring(0, 8)}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
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
          {selectedRound && (
            <div className="flex gap-3">
              <button
                onClick={() => setMapOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <MapPin className="h-4 w-4" /> View Map Audit
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export Excel
              </button>
            </div>
          )}
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
                  rounds.map((round) => {
                    const isSelected = selectedRound?.round_id === round.round_id;
                    return (
                      <tr 
                        key={round.round_id} 
                        className={`transition hover:bg-gray-50 ${isSelected ? 'bg-blue-50/60' : ''}`}
                      >
                        <td className="px-6 py-4 font-medium text-gray-900">{round.sites?.site_name ?? 'Main Campus'}</td>
                        <td className="px-6 py-4">
                          {round.guards?.full_name} 
                          <span className="block text-xs text-gray-400">ID: {round.guards?.employee_code}</span>
                        </td>
                        <td className="px-6 py-4">{new Date(round.started_at).toLocaleString()}</td>
                        <td className="px-6 py-4">{round.ended_at ? new Date(round.ended_at).toLocaleString() : 'In Progress'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            round.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {round.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleSelectRound(round)}
                            className="inline-flex items-center gap-1 rounded bg-white px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50"
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
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border p-1 text-gray-600 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border p-1 text-gray-600 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Selected Round Drill-Down (Side-by-Side Photos & Scans) */}
        {selectedRound && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Checkpoints Scanned ({roundScans.length})
              </h2>
              <span className="text-xs text-gray-500">
                Round ID: {selectedRound.round_id}
              </span>
            </div>

            {scansLoading ? (
              <p className="py-8 text-center text-sm text-gray-400">Loading checkpoints and proof photos...</p>
            ) : roundScans.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No checkpoints recorded for this round.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {roundScans.map((scan, idx) => (
                  <div key={scan.scan_id} className="rounded-lg border border-gray-200 p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <span className="text-xs font-semibold text-blue-600">Stop #{idx + 1}</span>
                        <h3 className="font-medium text-gray-900">{scan.checkpoint_name}</h3>
                        <p className="text-xs text-gray-400">{new Date(scan.scanned_at).toLocaleTimeString()}</p>
                      </div>
                      <div>
                        {scan.is_gps_verified ? (
                          <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700">
                            <CheckCircle2 className="h-3 w-3" /> Verified (≤50m)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> Drift Flagged ({scan.calculated_distance_m?.toFixed(0)}m)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Side-by-Side Verification Photos */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="mb-1 block text-xs font-medium text-gray-500">Guard Selfie</span>
                        <div className="aspect-square overflow-hidden rounded-md bg-gray-100">
                          {scan.selfie_url ? (
                            <img 
                              src={scan.selfie_url} 
                              alt="Guard Selfie" 
                              className="h-full w-full object-cover" 
                              loading="lazy" 
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-gray-400">No Selfie</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="mb-1 block text-xs font-medium text-gray-500">Location Photo</span>
                        <div className="aspect-square overflow-hidden rounded-md bg-gray-100">
                          {scan.location_photo_url ? (
                            <img 
                              src={scan.location_photo_url} 
                              alt="Location Proof" 
                              className="h-full w-full object-cover" 
                              loading="lazy" 
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-gray-400">No Location Photo</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {scan.remarks && (
                      <div className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-600">
                        <strong>Remarks:</strong> {scan.remarks}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Leaflet Map Modal */}
        <PatrolMapModal
          isOpen={mapOpen}
          onClose={() => setMapOpen(false)}
          scans={roundScans}
          roundTitle={`Round #${selectedRound?.round_id.substring(0, 8)} - ${selectedRound?.guards?.full_name}`}
        />
      </div>
    </div>
  );
};