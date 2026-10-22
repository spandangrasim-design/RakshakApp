-- 1. Clear out any old conflicting tables 
DROP TABLE IF EXISTS scans CASCADE;
DROP TABLE IF EXISTS patrol_rounds CASCADE;
DROP TABLE IF EXISTS checkpoints CASCADE;
DROP TABLE IF EXISTS incidents CASCADE;
DROP TABLE IF EXISTS sites CASCADE;
DROP TABLE IF EXISTS guards CASCADE;

-- 2. Enable PostGIS extension for GPS coordinate mapping
CREATE EXTENSION IF NOT EXISTS postgis;

-- 3. Create Sites table
CREATE TABLE sites (
    site_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Guards table (REQUIRED for Foreign Keys)
CREATE TABLE guards (
    guard_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    badge_number TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Checkpoints table
CREATE TABLE checkpoints (
    checkpoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(site_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    qr_payload TEXT UNIQUE NOT NULL,
    location geography(POINT, 4326), -- GPS coordinates
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create Patrol Rounds table (Tracks shifts/routes)
CREATE TABLE patrol_rounds (
    round_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guard_id UUID REFERENCES guards(guard_id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(site_id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    status TEXT DEFAULT 'in_progress'
);

-- 7. Create Scans table (Updated for Sprint 3 Mobile App sync)
CREATE TABLE scans (
    scan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID REFERENCES patrol_rounds(round_id) ON DELETE CASCADE,
    checkpoint_id UUID REFERENCES checkpoints(checkpoint_id) ON DELETE CASCADE,
    guard_id UUID REFERENCES guards(guard_id) ON DELETE CASCADE,
    scan_time TIMESTAMPTZ DEFAULT NOW(),
    
    -- Sprint 3 Anti-Spoofing & Camera Data
    device_uptime_seconds BIGINT,      -- Monotonic clock validation
    photo_url TEXT,                    -- <500KB watermarked live photo
    
    -- Sprint 3 Geofence Data
    gps_location geography(POINT, 4326), 
    distance_meters DOUBLE PRECISION,  -- Distance from master checkpoint
    is_gps_verified BOOLEAN            -- True = Green, False = Amber Flag
);

-- 8. Create Incidents table
CREATE TABLE incidents (
    incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guard_id UUID REFERENCES guards(guard_id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(site_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    reported_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Add spatial indexes for ultra-fast distance queries
CREATE INDEX checkpoints_location_idx ON checkpoints USING GIST (location);
CREATE INDEX scans_location_idx ON scans USING GIST (gps_location);