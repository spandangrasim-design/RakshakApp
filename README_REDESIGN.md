# Rakshak redesign: web console, patrol app, field app

One look across all three: deep indigo-blue brand, white cards on a soft grey-blue background,
rounded corners, big tap targets, one accent colour per status. Drop these files into your repo at the same paths.

## What changed

| Surface | Files | What you get |
|---|---|---|
| **Web** (`frontend/`) | `tailwind.config.js`, `index.html`, `src/index.css`, `src/components/AppShell.tsx`, `src/pages/Login.tsx`, `src/components/ui/kit.tsx` (new) | Phone: top bar + bottom tab bar (+ "More" sheet). Tablet: icon rail. Desktop: full collapsible sidebar. Split-screen login. New helpers: `.page`, `.btn-*`, `.field`, `.badge-*`, `.table-wrap`, `.grid-auto-sm/md`, `.sheet`; React `PageHeader`, `StatCard`, `StatusBadge`, `EmptyState`. |
| **Patrol app** (`rakshak_mobile/`) | `lib/main.dart`, `lib/theme/app_theme.dart`, `lib/widgets/{responsive,ui_kit}.dart` (new), `lib/screens/login_screen.dart`, `lib/screens/dashboard_screen.dart` | New theme for every screen. Login with show/hide password and autofill. Dashboard leads with a Start/End shift hero, then an auto-sizing action grid. All shift, permission and sync logic untouched (only `build()` and the card helper were replaced). |
| **Field app** (`rakshak_field/`) | `lib/main.dart`, same `theme/` + `widgets/`, `lib/screens/onboarding_screen.dart`, `lib/screens/routes_screen.dart` | Onboarding with a round selfie picker. Route cards with progress bars and status pills; 1, 2 or 3 columns by screen width. "Report incident" is a floating button. |

### How it adapts to any screen size
- **Web**: Tailwind breakpoints for the shell; `grid-auto-*` uses `auto-fill/minmax`, so card columns appear on their own. Tables scroll inside their own box, so the page never scrolls sideways. 44px tap targets and 16px inputs on touch screens (stops the iOS zoom-on-focus). Safe-area padding for notches.
- **Flutter**: `ResponsiveBody` caps content width on tablets/landscape; `AdaptiveGrid` and `SliverGridDelegateWithMaxCrossAxisExtent` choose column count by width; `clampTextScale` respects the user's font size but keeps layouts from breaking at extremes; screens scroll when the keyboard opens.

### Applying it
1. Copy the folders over your repo (they mirror its paths). Replace, don't merge.
2. `frontend`: `npm run dev`. Fonts load from Google Fonts (Inter) with system fallbacks.
3. Flutter: `flutter pub get && flutter run` in each app. No new packages needed.

### Honest limits
- **I could not compile or run any of this** (no Flutter SDK, no `node_modules`, no network in my sandbox). Please run both apps and `npm run build` once; expect small fixes at most.
- The other web pages (Reports, Incidents, Guards, QR, Tenants, Configs…) and the Flutter screens I did not rewrite (run, scanner, incident, activity log, incident list/thread…) **inherit the new colours, fonts, card style and theme automatically**, but their layouts are unchanged. Next step: swap their hand-written buttons/inputs/tables for `.btn-primary`, `.field`, `.table-wrap` and `kit.tsx`, one page at a time.
- Dashboard action cards use a fixed tile height (132 dp); the text-scale clamp keeps this safe.

## What to improve (most important first)

### 1. Security: do this before anything else
- **Rotate your secrets.** The zip contains a `.env` with the Supabase service-role key, JWT secret, R2 keys, WhatsApp token and Brevo key. `.gitignore` lists `.env`, but if this repo came from GitHub (`-main` suffix) and the file was ever committed, treat every one of them as leaked: rotate in Supabase, Cloudflare R2, Meta/WhatsApp, Brevo, and change `JWT_SECRET` (which logs everyone out). Use Wrangler secrets (`wrangler secret put`) for the Worker.
- **Admin token in `localStorage`** is readable by any XSS. Prefer an httpOnly, Secure, SameSite cookie, or at least short-lived access tokens with refresh.
- **`window.fetch` is monkey-patched** (`installAuthFetch`) to attach tokens. It works but is fragile. One small API client (like `apiFetch`) used everywhere is safer and easier to debug.

### 2. Reliability for guards on the ground
- **Field app is online-only.** Plants have dead zones. The patrol app already has `sqflite` + a `SyncService`; reuse that queue so scans are saved offline and uploaded later.
- Add haptic + sound on a successful scan, and a clear "saved / waiting to sync" state.

### 3. Code health
- **Hardcoded API URL in five places** (`api_config.dart`, `patrol_service.dart`, `incident_thread_screen.dart`, `GuardsView.tsx`, `secureMedia.ts`). Use one constant per app, set via `--dart-define` / `VITE_API_URL`.
- **Huge single files**: `backend/src/index.ts` (~247 KB, 57 routes), `GuardsView.tsx` (~83 KB), `ReportsPage.tsx` (~57 KB). Split by feature; smaller files are easier to restyle and review.
- **No automated tests** anywhere. Start with backend RBAC and login tests (the highest-risk code), then one smoke test per app.
- **Two Flutter apps duplicate** theme, API, camera and session code. Move shared code into a local package, or ship one app with a "guest" and a "login" mode.
- **Clean-up**: `rakshak_admin/` is an unused Vite template; delete it. Remove `gemini-code-*.md` and the duplicate BRD file. You have 5 overlapping CI workflows (`build-android`, `build-apk`, …); merge them.
- `withOpacity` is deprecated in newer Flutter (I used `withAlpha`); search for the rest.

### 4. Product and UX ideas
- **Language**: Hindi and Gujarati for the guard apps will likely help adoption more than any visual change. Add Flutter `intl` + ARB files.
- **Dark mode** for night-shift guards (the theme is already centralised, so it is one extra `ThemeData`).
- **Web tables**: add pagination or virtual scrolling for long lists; use `Skeleton` while loading; show an error boundary instead of a blank page.
- **Accessibility**: label icon-only buttons (done in the new shell), keep contrast at AA, test with TalkBack.
- **Performance**: `public/branding/rakshak-logo.png` is ~1 MB. Convert to WebP/SVG (< 50 KB). Lazy-load Leaflet and PDF/XLSX libraries only on the pages that use them.
- **Admin on phones**: with the bottom tab bar the console is now usable on a phone, but wide screens like the QR sheet designer will still be best on desktop.

If you want, send me one web page (e.g. `IncidentsDashboard.tsx` or `ReportsPage.tsx`) and one Flutter screen (e.g. `run_screen.dart`) and I'll convert them next as a pattern for the rest.
