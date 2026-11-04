-- =====================================================================
-- 005: Sequential incident case numbers (RKS-000001, RKS-000002, ... per industry)
-- Safe to re-run. Existing incidents are numbered by report date within each industry.
-- =====================================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS case_number BIGINT;

CREATE TABLE IF NOT EXISTS case_counters (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id),
  last_number BIGINT NOT NULL DEFAULT 0
);
ALTER TABLE case_counters ENABLE ROW LEVEL SECURITY;  -- only the Worker (service role) touches it

-- Atomic "give me the next number for this industry"
CREATE OR REPLACE FUNCTION next_case_number(p_tenant UUID) RETURNS BIGINT
LANGUAGE sql AS $$
  INSERT INTO case_counters (tenant_id, last_number) VALUES (p_tenant, 1)
  ON CONFLICT (tenant_id) DO UPDATE SET last_number = case_counters.last_number + 1
  RETURNING last_number;
$$;

-- Number the incidents that exist today, oldest first, separately for each industry
UPDATE incidents i
SET case_number = r.rn
FROM (
  SELECT client_incident_id,
         ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY reported_at, client_incident_id) AS rn
  FROM incidents
  WHERE tenant_id IS NOT NULL
) r
WHERE i.client_incident_id = r.client_incident_id
  AND i.case_number IS NULL;

-- Continue from the highest number already used
INSERT INTO case_counters (tenant_id, last_number)
SELECT tenant_id, MAX(case_number) FROM incidents WHERE tenant_id IS NOT NULL AND case_number IS NOT NULL GROUP BY tenant_id
ON CONFLICT (tenant_id) DO UPDATE SET last_number = GREATEST(case_counters.last_number, EXCLUDED.last_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_case_per_tenant ON incidents (tenant_id, case_number) WHERE case_number IS NOT NULL;
