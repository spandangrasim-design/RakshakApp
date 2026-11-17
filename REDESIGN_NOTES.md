# Rakshak light-premium redesign notes

## Visual direction

- Light canvas with white surfaces, soft borders, restrained shadows, and clear spacing.
- Rakshak blue for primary actions and active navigation; deep navy for headings and structure.
- Rounded, high-contrast cards and consistent form controls.
- Camera and QR scanning views retain dark surfaces where contrast is important for the scanner experience.

## Updated areas

### Web administration console (`frontend/`)

- Added a shared light-premium design layer in `src/index.css`.
- Refined the application shell: sidebar, brand block, navigation links, sticky top bar, and page canvas.
- Redesigned the administrator login experience with brand-led panel, clearer credential fields, and mobile layout.
- Added scoped dashboard hooks to keep future page-level polish consistent.

### Guard mobile app (`rakshak_mobile/`)

- Added `lib/rakshak_theme.dart` as the shared Material 3 light theme.
- Redesigned the employee login screen and added the Rakshak logo asset.
- Switched operational app bars to light surfaces while preserving the dark camera/scanner screens.
- Standardised the main app canvas and common buttons, inputs, snackbars, and navigation styling through the app theme.

### Field app (`rakshak_field/`)

- Added the same Material 3 light theme and brand asset.
- Redesigned the first-run site join/onboarding experience.
- Refined the route-list app bar and common controls through the shared theme.

## Functionality intentionally preserved

The redesign was limited to presentation, theme, and asset registration. Existing API clients, service classes, request paths, local storage, offline queue, authentication flows, permission checks, tenant/industry selection, and role-based module gating were left in place.

## Validation performed

- TypeScript/TSX syntax parsing completed for all 21 files under `frontend/src` with no syntax diagnostics.
- Basic delimiter-balance validation completed for all 36 Dart files.
- Full frontend build could not be completed in this environment because `npm ci` could not fetch packages from the npm registry (network resolution error).
- Flutter/Dart SDKs are not installed in this environment, so `flutter analyze` and platform builds could not be run here. Run the commands in the root README on your development machine before deployment.

## Credential handling

The source upload included a root `.env` with environment credentials. To avoid redistributing secrets, the redesigned archive omits `.env` and `frontend/.env.production`, and includes only placeholder templates. Restore values locally from your secret manager. Rotate any production credentials from the uploaded `.env` if they are active and you consider the upload exposure outside your intended security boundary.

## Repository note

The separate `rakshak_admin/` directory is an untouched Vite/React starter template according to its own README. The active administration console in this repository is `frontend/`, which is the web app updated in this redesign. The backend folder and SQL scripts were also left unchanged.
