-- 1. Safely create the priority enum
DO $$ BEGIN
    CREATE TYPE incident_priority AS ENUM ('P1', 'P2', 'P3', 'P4');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create the incidents table
CREATE TABLE IF NOT EXISTS incidents (
    incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_incident_id TEXT UNIQUE NOT NULL,
    guard_id UUID REFERENCES guards(guard_id),
    description TEXT NOT NULL,
    priority incident_priority NOT NULL,
    photo_url TEXT,
    status TEXT DEFAULT 'OPEN',
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);