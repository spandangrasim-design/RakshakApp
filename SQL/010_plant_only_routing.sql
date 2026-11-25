-- 1. Add configurable plant_code and email_notifications_enabled to plants
ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS plant_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;

-- 2. Backfill plant_code from existing names like "Test - P1" -> name="Test", plant_code="P1"
UPDATE plants
SET
  plant_code = TRIM(SPLIT_PART(name, '-', 2)),
  name = TRIM(SPLIT_PART(name, '-', 1))
WHERE name LIKE '%-%' AND (plant_code IS NULL OR TRIM(plant_code) = '');

UPDATE plants
SET plant_code = UPPER(LEFT(REGEXP_REPLACE(name, '[^A-Za-z0-9]', '', 'g'), 4))
WHERE plant_code IS NULL OR TRIM(plant_code) = '';

-- 3. Store plant_code on incidents so historical records always display "Plant Name (Code)"
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS plant_code TEXT;

UPDATE incidents i
SET
  plant_id = p.id,
  plant_name = p.name,
  plant_code = p.plant_code
FROM plants p
WHERE i.tenant_id = p.tenant_id
  AND (
    LOWER(TRIM(i.plant_name)) = LOWER(TRIM(p.name))
    OR LOWER(TRIM(i.plant_name)) = LOWER(TRIM(p.name || ' - ' || p.plant_code))
  );