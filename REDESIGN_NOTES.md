# Rakshak light-premium redesign — page-level pass

## Visual direction

- Light canvas, crisp white surfaces, soft blue-tinted page headers, restrained shadows, and clearer spacing.
- Rakshak blue for primary actions and active states; deep navy for structural emphasis and headings.
- Consistent typography hierarchy, pill-style state labels, improved tables, clearer data density, and refined form controls.
- Mobile interfaces prioritise large operational touch targets and clear patrol progress.
- Camera and QR scanning views retain dark surfaces where contrast is important.

## Web administration console (`frontend/`)

The active administration console is `frontend/`. This pass adds `src/rakshak-pages.css`, imported by `src/main.tsx`, and scoped page classes so the redesign reaches the actual inner pages rather than only the login and shell.

Updated pages:

- **Overview:** elevated KPI cards, calmer hierarchy, and consistent dashboard surfaces.
- **Incident queue:** redesigned page header, KPI tiles, search/filter area, case table headings, row spacing, and pagination surface.
- **Incident dispatch detail:** light branded case header, clearer case identity and priority treatment, and refined classification/resolution cards.
- **Patrol audit/reports:** upgraded KPI cards, filter controls, tables, and audit surfaces.
- **Workforce / guards:** redesigned page header, workforce metrics, group filters, search toolbar, and personnel table.
- **Routes & QR manager:** cleaner round-builder panels, checkpoint sections, and rounds table.
- **Daily shift reports:** stronger reporting header, scheduled report cards, delivery settings, dispatch log, and sticky save area.
- **Integrations:** wider settings layout, lighter title panel, and cleaner integration cards.
- **Industries / entitlements:** clearer industry selector, branding editor, and module configuration cards.

## Guard mobile app (`rakshak_mobile/`)

- Kept the shared Material 3 light theme and refined floating-action and text-selection treatments.
- Redesigned the dashboard officer identity panel and shift control panel.
- Rebuilt action tiles with clearer icon hierarchy, supporting text, and affordance.
- Improved incident ticket tabs and cards.
- Refreshed activity-log summary metrics and scan history surfaces.
- Refined patrol route selection chips and checkpoint card surfaces.

## Field app (`rakshak_field/`)

- Retained the shared light theme and onboarding identity.
- Added a route overview panel with assigned, completed, and in-progress counts.
- Refined route cards with status pills, checkpoint progress bars, and clearer supporting details.
- Upgraded the active-run progress panel with verified checkpoint count, percentage, and paused/in-progress states.

## Functionality intentionally preserved

The redesign changes presentation and derived display-only values. Existing API clients, request paths, authentication flows, token handling, offline queue, route/incident actions, QR verification, local storage, tenant/industry selection, server permission checks, and role/module gates were not intentionally changed. No backend or SQL files were edited in this page-level pass.

## Validation performed

- TypeScript/TSX syntax parsing: all 21 files under `frontend/src` parsed with zero syntax diagnostics.
- CSS parsing: `src/rakshak-pages.css` parsed with zero syntax errors.
- Dart delimiter-balance scan: all Dart source files in both Flutter projects were checked; a delimiter scan is not a substitute for `dart analyze`.
- Full frontend dependency build was not available because this environment has no installed `node_modules` and package registry access is unavailable.
- Flutter/Dart SDKs are not installed in this environment, so `flutter analyze`, Android builds, and iOS builds could not be run here.

Run the following on your development machine before replacing the existing deployment:

```bash
cd frontend && npm ci && npm run build
cd ../rakshak_mobile && flutter pub get && flutter analyze && flutter build apk --release
cd ../rakshak_field && flutter pub get && flutter analyze && flutter build apk --release
```

## Credential handling

The original source upload contained environment credentials. The redesigned archive excludes populated `.env` files and includes placeholder templates only. Restore secrets locally from your secret manager. Rotate any production credentials that were present in the uploaded archive if they are active.

## Repository note

`rakshak_admin/` is a separate starter template and was left unchanged; the active administration console is `frontend/`. Backend services and SQL scripts were also left unchanged.

Test