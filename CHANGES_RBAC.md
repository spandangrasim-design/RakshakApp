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

---
# Security hardening (round 2)

## You must do these by hand (cannot be done from code)
1. Cloudflare -> Worker -> Settings -> Variables and Secrets: set SUPABASE_SERVICE_ROLE_KEY to the real
   `service_role` key, Deploy, then open the Industries page: no red "Security warning" banner = correct key.
2. Run SQL/003_security_hardening.sql PART A now. Run PART B (enables RLS on every table) only after step 1 is confirmed.
3. Rotate the Supabase service_role key (the old one was inside an uploaded zip), then update the Worker secret again.
4. Industries page -> "Secure passwords now" (converts leftover plain-text passwords to hashes).
5. Frontend: `cd frontend && npm install` is NOT required (tailwind/postcss were already in package-lock), but check the
   build once: `npm run build` and look at the pages.
6. Android release signing (optional but recommended): create a keystore and add GitHub secrets
   ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
   NOTE: switching from the debug key to a release key means existing installs must be uninstalled once.

## What changed in code
- QR scans: signature must be a real HMAC; the "close enough to the coordinates" bypass is removed.
  Expected coordinates now come from the database, the checkpoint must belong to the caller's organization,
  and the guard must be within GEOFENCE_RADIUS_M (default 250 m, set in wrangler.toml) of the checkpoint.
- Login: 5 failed attempts per account (30 per IP) lock for 15 min. New passwords must be 8+ chars.
- Emails: all incident text is HTML-escaped, photo URL must be https, recipient addresses validated.
- Uploads: max 8 MB, must be a real JPEG/PNG, stored under random unguessable keys; media served with
  nosniff + sandbox CSP + private cache, no wildcard CORS.
- CORS restricted to the admin console origin(s) (ALLOWED_ORIGINS var to override).
- Internal error text no longer returned to clients; global error handler added.
- New patrol sessions / shifts / scans get tenant_id.
- Web: Tailwind CDN removed (bundled), CSP + security headers via public/_headers.
- Mobile: token stored in encrypted storage (flutter_secure_storage) with one-time migration from old storage.

## Known limits
- Admin web token still lives in localStorage (CSP now blocks injected scripts; httpOnly cookies would be the next step).
- Photos are served from unguessable URLs (anyone holding a URL can view it). Signed, expiring URLs would be the next step.
- Photos uploaded before this change keep their old predictable URLs.
