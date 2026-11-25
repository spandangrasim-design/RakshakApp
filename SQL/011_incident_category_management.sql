-- Tenant-scoped incident category master. Historical incident.category values remain unchanged.
CREATE TABLE IF NOT EXISTS public.incident_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT incident_categories_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS incident_categories_tenant_active_idx
  ON public.incident_categories (tenant_id, is_active, name);

-- Preserve every category already used by historical incidents.
INSERT INTO public.incident_categories (tenant_id, name, is_active)
SELECT DISTINCT i.tenant_id, trim(i.category), TRUE
FROM public.incidents i
WHERE i.tenant_id IS NOT NULL AND i.category IS NOT NULL AND trim(i.category) <> ''
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Seed the existing web/mobile default choices only for tenants that have incidents;
-- this avoids introducing global or cross-tenant category records.
INSERT INTO public.incident_categories (tenant_id, name, is_active)
SELECT t.id, seed.name, TRUE
FROM public.tenants t
CROSS JOIN (VALUES
  ('Security / Patrol'), ('Asset Breach'), ('Fire / Hazard'), ('Access Control'),
  ('Safety Hazard'), ('Fire'), ('Medical'), ('Theft / Intrusion'), ('Equipment Fault'), ('Other'),
  ('Fire & Safety'), ('Access Control / Gate'), ('Equipment / CCTV Fault'), ('Visitor / Perimeter Breach')
) AS seed(name)
ON CONFLICT (tenant_id, name) DO NOTHING;

ALTER TABLE public.incident_categories ENABLE ROW LEVEL SECURITY;
-- Application access is mediated by the authenticated Cloudflare Worker using its service role.
-- No anon/authenticated direct table grants are introduced by this migration.
REVOKE ALL ON TABLE public.incident_categories FROM anon, authenticated;
GRANT ALL ON TABLE public.incident_categories TO service_role;
