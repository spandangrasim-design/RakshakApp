export interface Guard {
  guard_id: string;
  full_name: string;
  employee_code: string;
}

export interface Site {
  site_id: string;
  site_name: string;
}

export interface PatrolRound {
  round_id: string;
  client_round_id: string;
  site_id: string;
  guard_id: string;
  started_at: string;
  ended_at: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'AUTO_CLOSED';
  guards?: Guard;
  sites?: Site;
  scans_count?: number;
}

export interface CheckpointScanDetail {
  scan_id: string;
  checkpoint_name: string;
  scanned_at: string;
  status: string;
  selfie_url: string | null;
  location_photo_url: string | null;
  remarks: string | null;
  calculated_distance_m: number | null;
  is_gps_verified: boolean;
  // Master Checkpoint Coords (from checkpoints table)
  master_lat: number;
  master_lng: number;
  // Guard Actual Scan Coords (from PostGIS POINT)
  scan_lat: number | null;
  scan_lng: number | null;
}