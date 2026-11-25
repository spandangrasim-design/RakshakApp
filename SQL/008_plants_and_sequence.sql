-- 1. Sequential ordering for QR checkpoints
ALTER TABLE checkpoints
  ADD COLUMN IF NOT EXISTS sequence_order INTEGER DEFAULT 0;

-- 2. Replace mandatory priority with plant_name on incidents
ALTER TABLE incidents
  ALTER COLUMN priority DROP NOT NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS plant_name TEXT;

-- 3. Assignable plants per user/guard
ALTER TABLE guards
  ADD COLUMN IF NOT EXISTS assigned_plants TEXT[] DEFAULT '{}';
