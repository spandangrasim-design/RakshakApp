import * as XLSX from 'xlsx';

export interface RoundSummaryExportData {
  round_id?: string;
  id?: string;
  sites?: { site_name?: string };
  name?: string;
  guards?: { full_name?: string; employee_code?: string };
  guard_name?: string;
  started_at?: string;
  start_time?: string;
  ended_at?: string | null;
  end_time?: string | null;
  status?: string;
  scans?: any[];
}

export interface ScanDetailExportData {
  scan_id?: string;
  id?: string;
  checkpoint_name?: string;
  checkpoint_id: string;
  scanned_at?: string;
  scan_time?: string;
  is_gps_verified?: boolean;
  distance_meters?: number | null;
  calculated_distance_m?: number | null;
  guard_lat?: number | string | null;
  guard_lng?: number | string | null;
  expected_lat?: number | string | null;
  expected_lng?: number | string | null;
  selfie_url?: string | null;
  location_photo_url?: string | null;
  photo_url?: string | null;
  remarks?: string | null;
}

/**
 * Downloads a worksheet as either an .xlsx workbook or raw .csv file
 */
function downloadFile(worksheet: XLSX.WorkSheet, sheetName: string, fileNamePrefix: string, format: 'xlsx' | 'csv') {
  const timestamp = new Date().toISOString().slice(0, 10);
  const fileName = `${fileNamePrefix}_${timestamp}.${format}`;

  if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  }
}

/**
 * Export Master Rounds & Shifts Summary
 */
export function exportRoundsSummary(rounds: RoundSummaryExportData[], format: 'xlsx' | 'csv' = 'xlsx') {
  if (!rounds || rounds.length === 0) return;

  const rows = rounds.map((r) => {
    const roundId = r.round_id || r.id || 'N/A';
    const siteName = r.sites?.site_name || r.name || 'Main Campus';
    const guardName = r.guards?.full_name || r.guard_name || 'N/A';
    const guardCode = r.guards?.employee_code || 'N/A';
    const start = r.started_at || r.start_time;
    const end = r.ended_at || r.end_time;

    return {
      'Round ID': roundId,
      'Site': siteName,
      'Guard Name': guardName,
      'Employee Code': guardCode,
      'Shift / Round Start': start ? new Date(start).toLocaleString() : 'N/A',
      'Shift / Round End': end ? new Date(end).toLocaleString() : 'In Progress',
      'Status': r.status || 'COMPLETED',
      'Total Checkpoints Scanned': r.scans ? r.scans.length : 0,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  downloadFile(worksheet, 'Rounds Summary', 'Rakshak_Patrol_Summary', format);
}

/**
 * Export Selected Patrol Round Checkpoint Scans & Audit Proofs
 */
export function exportRoundAuditScans(
  round: RoundSummaryExportData,
  scans: ScanDetailExportData[],
  format: 'xlsx' | 'csv' = 'xlsx'
) {
  if (!scans || scans.length === 0) return;

  const roundId = round.round_id || round.id || 'Round';
  const siteName = round.sites?.site_name || round.name || 'Main Campus';
  const guardName = round.guards?.full_name || round.guard_name || 'N/A';

  const rows = scans.map((s, idx) => {
    const scanTime = s.scanned_at || s.scan_time;
    const drift = s.calculated_distance_m ?? s.distance_meters;
    const selfie = s.selfie_url || s.photo_url || '';
    const locPhoto = s.location_photo_url || s.photo_url || '';

    return {
      'Stop #': idx + 1,
      'Round ID': roundId,
      'Site': siteName,
      'Guard Name': guardName,
      'Checkpoint Name': s.checkpoint_name || s.checkpoint_id,
      'Checkpoint ID': s.checkpoint_id,
      'Scan Timestamp': scanTime ? new Date(scanTime).toLocaleString() : 'N/A',
      'GPS Verified': s.is_gps_verified ? 'PASS' : 'DRIFT_FLAGGED',
      'Distance Drift (m)': drift != null ? Number(drift).toFixed(1) : 'N/A',
      'Actual Lat': s.guard_lat ?? 'N/A',
      'Actual Lng': s.guard_lng ?? 'N/A',
      'Target Lat': s.expected_lat ?? 'N/A',
      'Target Lng': s.expected_lng ?? 'N/A',
      'Guard Selfie URL': selfie,
      'Location Photo URL': locPhoto,
      'Remarks': s.remarks || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const shortId = String(roundId).substring(0, 8);
  downloadFile(worksheet, 'Checkpoint Audits', `Rakshak_Audit_Round_${shortId}`, format);
}