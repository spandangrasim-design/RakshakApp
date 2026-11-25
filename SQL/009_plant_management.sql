-- 1. Create dedicated Plant Management table
CREATE TABLE IF NOT EXISTS plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  team_name TEXT,
  assigned_guard_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

-- 2. Link incidents to plants while preserving historical plant_name text
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES plants(id) ON DELETE SET NULL;

-- 3. Backfill historical incidents that currently show "Unassigned Plant"
UPDATE incidents
SET plant_name = CASE
  WHEN assignment_group = 'Security Operations L1' THEN 'Test - P1'
  WHEN assignment_group = 'Quick Response Team (QRT)' THEN 'Test2 - P2'
  WHEN assignment_group IS NOT NULL AND TRIM(assignment_group) <> '' THEN assignment_group
  ELSE 'Test - P1'
END
WHERE plant_name IS NULL OR TRIM(plant_name) = '';