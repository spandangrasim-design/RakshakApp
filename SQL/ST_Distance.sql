-- 1. Enable PostGIS extension for spatial routing
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create the patrol scans table
CREATE TABLE IF NOT EXISTS patrol_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkpoint_id TEXT NOT NULL,
    guard_id TEXT NOT NULL,
    scan_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    guard_lat DOUBLE PRECISION NOT NULL,
    guard_lng DOUBLE PRECISION NOT NULL,
    expected_lat DOUBLE PRECISION NOT NULL,
    expected_lng DOUBLE PRECISION NOT NULL,
    distance_meters DOUBLE PRECISION,
    is_gps_verified BOOLEAN,
    photo_url TEXT
);

-- 3. Create the PostGIS Distance Calculator Function
CREATE OR REPLACE FUNCTION log_patrol_scan(
    p_checkpoint_id TEXT,
    p_guard_id TEXT,
    p_guard_lat DOUBLE PRECISION,
    p_guard_lng DOUBLE PRECISION,
    p_expected_lat DOUBLE PRECISION,
    p_expected_lng DOUBLE PRECISION,
    p_photo_url TEXT
) RETURNS JSON AS $$
DECLARE
    v_distance DOUBLE PRECISION;
    v_is_verified BOOLEAN;
    v_scan_id UUID;
BEGIN
    -- Calculate distance in meters using PostGIS Geography casting
    v_distance := ST_Distance(
        ST_SetSRID(ST_MakePoint(p_guard_lng, p_guard_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_expected_lng, p_expected_lat), 4326)::geography
    );

    -- Flag Amber (false) if distance > 50 meters
    v_is_verified := v_distance <= 50;

    -- Insert the verified record
    INSERT INTO patrol_scans (
        checkpoint_id, guard_id, guard_lat, guard_lng, 
        expected_lat, expected_lng, distance_meters, is_gps_verified, photo_url
    ) VALUES (
        p_checkpoint_id, p_guard_id, p_guard_lat, p_guard_lng, 
        p_expected_lat, p_expected_lng, v_distance, v_is_verified, p_photo_url
    ) RETURNING id INTO v_scan_id;

    RETURN json_build_object(
        'scan_id', v_scan_id,
        'distance_meters', v_distance,
        'is_gps_verified', v_is_verified
    );
END;
$$ LANGUAGE plpgsql;
--To strictly satisfy the requirement of using a PostGIS ST_Distance query for the 50-meter geofence, we will create a Postgres function (RPC) in Supabase. This handles the complex geospatial math directly in the database.