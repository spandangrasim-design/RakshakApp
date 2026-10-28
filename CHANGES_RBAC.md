# Three-tier RBAC (Super Admin -> Industry Admin -> User)

Final feature = (Super Admin enabled for industry) AND (Industry Admin enabled for user). Fail-closed.
Unbought -> 404 (does not exist). Bought but not allocated -> 403.

## Deploy order
1. SQL/002_three_tier_rbac.sql  (review the "Legacy Plant" backfill first; a guard with employee_code `superadmin` must exist)
2. backend (wrangler deploy) + frontend together
3. rebuild the Flutter app

## New / changed
- backend/src/rbac.ts            cascade, clamp, auth + tier/module/permission middleware
- backend/src/index.ts           auth on every /api/v1 route, tenant scoping, per-tenant config/email/WhatsApp/cron, hashed passwords
- frontend/src/pages/TenantsPage.tsx   Super Admin: industries + entitlements
- frontend/src/App.tsx, Login.tsx, GuardsView.tsx, services/api.ts, main.tsx
- rakshak_mobile: dashboard_screen, incident_report_screen, auth_service

## Not covered
- Not compiled/run: no node_modules or Dart SDK was available. Run `npm i && npx tsc --noEmit` in backend/ and frontend/, and `flutter analyze`.
- rakshak_mobile/lib/screens/mobile_admin_access_screen.dart is imported but was missing from the upload.
- /api/v1/media/* remains public (img tags cannot send a token).
