# Plant Routing and Dynamic Incident Categories

## Implementation summary

- Removed Assignment Group from the incident dispatch email HTML. Plant name/code, case, status, responder, description, and incident photo remain in the template.
- Renamed the plant recipient dispatcher internally and removed group-based incident creation/update writes. Legacy database columns and historical migration files are intentionally retained.
- Removed Response Groups controls, group filtering/statistics, and the Assignment Groups table column from People & App Access.
- Removed the obsolete group field from the incident form permission model and mobile permission labels.
- Added a tenant-scoped incident category master, authenticated category read API, and admin-tier create/update/activate/deactivate APIs.
- Added Category Management to the existing administration/settings page.
- Updated web and Flutter incident category dropdowns to load active categories from the API.
- Added plant-eligible responder selection to the web incident creation form and server-side validation on create/update.
- Historical category values are seeded into the category master. Renaming a category updates incident display values; deactivating a category does not alter historical incidents.

## Database migration

Apply `SQL/011_incident_category_management.sql` to the existing Supabase database before deploying the backend/frontend changes. It creates `public.incident_categories`, seeds existing distinct incident categories and existing category defaults per tenant, enables RLS, revokes direct `anon`/`authenticated` access, and grants service-role access. Application requests go through the authenticated Cloudflare Worker; category writes are restricted to the existing admin tiers and tenant scope.

No existing tables, assignment-group columns, or historical incident rows are dropped.

## Deployment order

1. Review and apply `SQL/011_incident_category_management.sql` in Supabase.
2. Deploy the updated Cloudflare Worker from `backend/`.
3. Deploy the updated web frontend from `frontend/`.
4. Rebuild/release both Flutter applications so category dropdown changes reach installed clients.
5. Test category create/rename/deactivate, plant responder eligibility, incident email, and permissions in a non-production tenant first.

## Validation performed in this workspace

- TypeScript/TSX source parsing: passed for all changed TypeScript files.
- Repository-wide runtime-source search for Assignment Group / Response Groups labels and old group constants: no remaining matches in backend/frontend/Flutter runtime source. The existing `SQL/009_plant_management.sql` intentionally retains its historical backfill references.
- Full frontend build: not completed. `npm ci` timed out in this environment and the subsequent build reported missing/incomplete type-definition packages under `frontend/node_modules`.
- Flutter build/analyzer: not run because the Flutter SDK is not available in this environment.
- Supabase migration and live API/email tests: not run; no database mutation or deployment was performed.

## Important release notes

- The migration must be applied before deploying incident creation code because new incidents are validated against active category rows.
- The ZIP provided to the user excludes the root `.env` file and `node_modules`. Keep the original environment file securely outside source control and configure deployment secrets through the existing hosting secret manager.
- The supplied ZIP did not include `.git` metadata, so this workspace cannot report a Git diff against a branch or push commits to the remote repository.
