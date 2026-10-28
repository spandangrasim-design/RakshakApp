-- =====================================================================
-- 002: Three-tier RBAC (Super Admin -> Industry Admin -> User)
-- Safe to re-run. Review the BACKFILL section before running in production.
-- =====================================================================

-- 1. Tenants (one row per industry / plant company)
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE | SUSPENDED
  features    JSONB NOT NULL DEFAULT '{}'::jsonb,    -- Tier-1 entitlements. Empty = nothing purchased.
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tier on guards (role stays as a human label like "Shift Supervisor")
ALTER TABLE guards ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE guards ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Guard';
ALTER TABLE guards ADD COLUMN IF NOT EXISTS app_permissions JSONB;   -- Tier-3: what the plant admin allocated
ALTER TABLE guards ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_tier_check;
ALTER TABLE guards ADD CONSTRAINT guards_tier_check CHECK (tier IN ('SUPER_ADMIN','INDUSTRY_ADMIN','USER'));
-- Only super admins may have no tenant.
ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_tenant_required;
ALTER TABLE guards ADD CONSTRAINT guards_tenant_required
  CHECK (tier = 'SUPER_ADMIN' OR tenant_id IS NOT NULL) NOT VALID;  -- VALIDATE after backfill

-- 3. tenant_id on every tenant-owned table
ALTER TABLE incidents        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE rounds           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE checkpoints      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE scans            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE shifts           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE patrol_sessions  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_guards_tenant          ON guards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant       ON incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rounds_tenant          ON rounds(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scans_tenant           ON scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant          ON shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patrol_sessions_tenant ON patrol_sessions(tenant_id);

-- 4. Per-tenant integration settings (gmail creds etc. must not be shared across tenants)
ALTER TABLE admin_configurations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- =====================================================================
-- BACKFILL  (EDIT THE NAME / CODES BELOW BEFORE RUNNING)
-- =====================================================================
-- 5. Put every existing guard into one "Legacy" tenant so nothing is orphaned.
INSERT INTO tenants (name, status, features)
SELECT 'Legacy Plant', 'ACTIVE', jsonb_build_object(
  'module_patrol',        jsonb_build_object('enabled', true, 'allow_route_assignment', true, 'allow_live_gps_trail', true, 'allow_geofence_audit', true),
  'module_incidents',     jsonb_build_object('enabled', true, 'allow_web_ticket_queue', true, 'allow_mobile_incident_creation', true,
                            'allowed_creation_options', jsonb_build_object('option_1_severity', true,'option_2_category', true,'option_3_group_routing', true,'option_4_title', true,'option_5_description', true,'option_6_camera_photo', true)),
  'module_integrations',  jsonb_build_object('enabled', true, 'channels', jsonb_build_object('gmail_oauth', true,'whatsapp_api', false,'telegram_bot', false)),
  'module_qr_generator',  jsonb_build_object('enabled', true, 'allow_pdf_export', true),
  'module_activity_logs', jsonb_build_object('enabled', true),
  'module_sync_queue',    jsonb_build_object('enabled', true)
)
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE name = 'Legacy Plant');

UPDATE guards SET tenant_id = (SELECT id FROM tenants WHERE name = 'Legacy Plant')
WHERE tenant_id IS NULL AND employee_code <> 'superadmin';

-- 6. Tiers: platform owner, plant admins, everyone else = USER
UPDATE guards SET tier = 'SUPER_ADMIN', tenant_id = NULL WHERE employee_code = 'superadmin';
UPDATE guards SET tier = 'INDUSTRY_ADMIN'
WHERE tier = 'USER' AND role IN ('Admin','Chief Security Officer','Security Manager');

-- 7. Propagate tenant to data rows through the guard that created them
UPDATE incidents       i SET tenant_id = g.tenant_id FROM guards g WHERE i.guard_id = g.guard_id AND i.tenant_id IS NULL;
UPDATE scans           s SET tenant_id = g.tenant_id FROM guards g WHERE s.guard_id = g.guard_id AND s.tenant_id IS NULL;
UPDATE shifts          s SET tenant_id = g.tenant_id FROM guards g WHERE s.guard_id = g.guard_id AND s.tenant_id IS NULL;
UPDATE patrol_sessions p SET tenant_id = g.tenant_id FROM guards g WHERE p.guard_id = g.guard_id AND p.tenant_id IS NULL;
-- rounds/checkpoints have no guard owner: assign legacy tenant, then fix manually per customer.
UPDATE rounds      SET tenant_id = (SELECT id FROM tenants WHERE name = 'Legacy Plant') WHERE tenant_id IS NULL;
UPDATE checkpoints SET tenant_id = (SELECT id FROM tenants WHERE name = 'Legacy Plant') WHERE tenant_id IS NULL;

-- 7b. Per-guard permissions used to live in one JSON blob (admin_configurations.GUARD_EXTENDED_PROFILES).
--     The API now reads guards.app_permissions only, so copy them across.
UPDATE guards g
SET app_permissions = (b.v -> g.guard_id::text -> 'app_permissions')
FROM (SELECT key_value::jsonb AS v FROM admin_configurations WHERE key_name = 'GUARD_EXTENDED_PROFILES') b
WHERE g.app_permissions IS NULL
  AND b.v ? g.guard_id::text
  AND jsonb_typeof(b.v -> g.guard_id::text -> 'app_permissions') = 'object';

-- 7c. Integration settings are now stored per tenant as  t:<tenant_id>:<KEY>.
--     Move today's global settings under the Legacy tenant (GUARD_EXTENDED_PROFILES stays global, read-only legacy).
UPDATE admin_configurations
SET key_name = 't:' || (SELECT id FROM tenants WHERE name = 'Legacy Plant') || ':' || key_name
WHERE key_name NOT LIKE 't:%' AND key_name <> 'GUARD_EXTENDED_PROFILES';

-- 8. Now enforce
ALTER TABLE guards VALIDATE CONSTRAINT guards_tenant_required;

-- 9. Defense in depth: block direct anon/authenticated access. Only the Worker (service role) reads data.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE guards  ENABLE ROW LEVEL SECURITY;
