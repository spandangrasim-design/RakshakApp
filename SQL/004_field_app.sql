-- =====================================================================
-- 004: No-login Field app (guest enrolment + shared route status)
-- Safe to re-run.
-- =====================================================================

-- Guests are stored as normal guard rows flagged is_guest (they can never password-login)
ALTER TABLE guards ADD COLUMN IF NOT EXISTS phone          TEXT;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS is_guest       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS selfie_url     TEXT;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS last_device_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_phone_per_tenant ON guards (tenant_id, phone) WHERE is_guest;

-- Site code a guard must type to join an industry (set by the Super Admin on the Industries page)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS guest_join_code TEXT;

-- A route counts as DONE only when the server confirmed every checkpoint was scanned
ALTER TABLE patrol_sessions ADD COLUMN IF NOT EXISTS completed_route BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE patrol_sessions ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_tenant_round_start ON patrol_sessions (tenant_id, round_id, start_time);
CREATE INDEX IF NOT EXISTS idx_scans_guard_time            ON scans (guard_id, scan_time);
