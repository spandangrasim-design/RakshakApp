-- SQL/007_industry_branding.sql
-- Adds Industry-Wise Logo & Address branding to the existing tenants table

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);
