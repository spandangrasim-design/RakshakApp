-- =====================================================================
-- 003: Security hardening
-- PART A is safe to run now. PART B must wait until the Worker uses the
-- real service_role key (check: Industries page shows no red warning).
-- =====================================================================

-- ---------- PART A: safe now ----------

-- Login brute-force protection (used by the Worker; keys are "acct:<code>" and "ip:<addr>")
CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key  TEXT PRIMARY KEY,
  fail_count   INT  NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ
);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;  -- no policies: only the service_role key can touch it

-- Make sure data rows created before today are attached to an organization
UPDATE patrol_sessions p SET tenant_id = g.tenant_id FROM guards g WHERE p.guard_id = g.guard_id AND p.tenant_id IS NULL;
UPDATE shifts          s SET tenant_id = g.tenant_id FROM guards g WHERE s.guard_id = g.guard_id AND s.tenant_id IS NULL;
UPDATE scans           s SET tenant_id = g.tenant_id FROM guards g WHERE s.guard_id = g.guard_id AND s.tenant_id IS NULL;

-- ---------- PART B: run AFTER the Worker is confirmed to use service_role ----------
-- Turns on row-level security for every table in the public schema.
-- With RLS on and no policies, the public (anon) key can read/write NOTHING.
-- The Worker (service_role) bypasses RLS, so the app keeps working.
-- PostGIS system tables are skipped because the extension owns them.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('spatial_ref_sys')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')  -- skip extension-owned tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- Verify: every row should show rls_on = true
-- select relname, relrowsecurity as rls_on from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
