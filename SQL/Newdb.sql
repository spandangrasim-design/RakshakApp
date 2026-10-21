-- 1. Enable PostGIS Extension for GPS Geofencing
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create Core Tables
CREATE TABLE sites (
    site_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_name VARCHAR(255) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE guards (
    guard_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE checkpoints (
    checkpoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(site_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    qr_serial_number VARCHAR(100) UNIQUE NOT NULL,
    qr_signature_hash VARCHAR(64) NOT NULL,
    -- PostGIS Geography column to store exact latitude/longitude
    master_location GEOGRAPHY(POINT, 4326) NOT NULL, 
    geofence_radius_m INT DEFAULT 50,
    is_indoor BOOLEAN DEFAULT FALSE
);

CREATE TABLE patrol_rounds (
    round_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_round_id UUID UNIQUE NOT NULL, -- For offline idempotency
    site_id UUID REFERENCES sites(site_id),
    guard_id UUID REFERENCES guards(guard_id),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'IN_PROGRESS' 
);

CREATE TABLE scans (
    scan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_scan_id UUID UNIQUE NOT NULL, -- Prevents duplicate offline syncs
    round_id UUID REFERENCES patrol_rounds(round_id) ON DELETE CASCADE,
    checkpoint_id UUID REFERENCES checkpoints(checkpoint_id),
    scanned_at TIMESTAMPTZ NOT NULL,
    scan_location GEOGRAPHY(POINT, 4326), 
    gps_accuracy_m FLOAT,
    status VARCHAR(50), 
    selfie_url TEXT,
    location_photo_url TEXT,
    remarks TEXT,
    calculated_distance_m FLOAT,
    is_gps_verified BOOLEAN DEFAULT FALSE
);

CREATE TABLE incidents (
    incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_incident_id UUID UNIQUE NOT NULL,
    site_id UUID REFERENCES sites(site_id),
    guard_id UUID REFERENCES guards(guard_id),
    priority VARCHAR(10) NOT NULL, 
    title VARCHAR(120),
    description TEXT,
    reported_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'OPEN',
    incident_location GEOGRAPHY(POINT, 4326),
    media_urls TEXT[]
);

-- 3. Create Spatial Indexes for Fast GPS Queries
CREATE INDEX idx_checkpoints_location ON checkpoints USING GIST (master_location);
CREATE INDEX idx_scans_location ON scans USING GIST (scan_location);