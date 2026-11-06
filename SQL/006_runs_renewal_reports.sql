-- =====================================================================
-- 006: Pause / end route, route renewal, daily shift reports
-- Safe to re-run. Run BEFORE deploying the new backend.
-- =====================================================================

-- ---- Route runs: pause and end early ----
ALTER TABLE patrol_sessions ADD COLUMN IF NOT EXISTS paused_at     TIMESTAMPTZ;
ALTER TABLE patrol_sessions ADD COLUMN IF NOT EXISTS pause_reason  TEXT;
ALTER TABLE patrol_sessions ADD COLUMN IF NOT EXISTS paused_seconds INT NOT NULL DEFAULT 0;
ALTER TABLE patrol_sessions ADD COLUMN IF NOT EXISTS ended_reason  TEXT;
ALTER TABLE patrol_sessions ADD COLUMN IF NOT EXISTS ended_note    TEXT;

-- New status values (PAUSED, ENDED_EARLY): drop any old CHECK that only allowed ACTIVE/COMPLETED
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.patrol_sessions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE patrol_sessions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- ---- Route renewal ----
-- renew_every_minutes: NULL = renews daily at midnight; e.g. 240 = every 4 hours
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS renew_every_minutes INT;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS renewed_at          TIMESTAMPTZ;

-- ---- Daily shift reports: one row per guard per shift per day, so nothing is sent twice ----
CREATE TABLE IF NOT EXISTS daily_report_log (
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  guard_id    TEXT NOT NULL,
  shift_name  TEXT NOT NULL,
  report_date DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | SENT | FAILED | SKIPPED
  recipients  TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  sent_at     TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, guard_id, shift_name, report_date)
);
ALTER TABLE daily_report_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_report_log_tenant_created ON daily_report_log (tenant_id, created_at DESC);
