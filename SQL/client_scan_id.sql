-- 1. Add the client_scan_id column with a UNIQUE constraint to prevent duplicates
ALTER TABLE scans 
ADD COLUMN client_scan_id UUID UNIQUE;

-- 2. Update the RPC function to accept the client_scan_id and handle conflicts safely
DROP FUNCTION IF EXISTS log_patrol_scan;

CREATE OR REPLACE FUNCTION log_patrol_scan(
    p_client_scan_id UUID,
    p_checkpoint_id TEXT,
    p_guard_id TEXT,
    p_guard_lat DOUBLE PRECISION,
    p_guard_lng DOUBLE PRECISION,
    p_expected_lat DOUBLE PRECISION,
    p_expected_lng DOUBLE PRECISION,
    p_uptime_seconds BIGINT,
    p_photo_url TEXT
) RETURNS JSON AS $$
DECLARE
    v_distance DOUBLE PRECISION;
    v_is_verified BOOLEAN;
    v_scan_id UUID;
BEGIN
    -- Check if this scan was already synced (Idempotency check)
    SELECT id INTO v_scan_id FROM scans WHERE client_scan_id = p_client_scan_id;
    IF v_scan_id IS NOT NULL THEN
        RETURN json_build_object('scan_id', v_scan_id, 'status', 'already_synced');
    END IF;

    -- Calculate geofence distance
    v_distance := ST_Distance(
        ST_SetSRID(ST_MakePoint(p_guard_lng, p_guard_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_expected_lng, p_expected_lat), 4326)::geography
    );

    v_is_verified := v_distance <= 50;

    -- Insert new record
    INSERT INTO scans (
        client_scan_id, checkpoint_id, guard_id, guard_lat, guard_lng, 
        distance_meters, is_gps_verified, device_uptime_seconds, photo_url
    ) VALUES (
        p_client_scan_id, p_checkpoint_id, p_guard_id, p_guard_lat, p_guard_lng, 
        v_distance, v_is_verified, p_uptime_seconds, p_photo_url
    ) RETURNING id INTO v_scan_id;

    RETURN json_build_object(
        'scan_id', v_scan_id,
        'distance_meters', v_distance,
        'is_gps_verified', v_is_verified,
        'status', 'inserted'
    );
END;
$$ LANGUAGE plpgsql;