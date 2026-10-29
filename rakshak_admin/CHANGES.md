# Rakshak - change log

## QR scanner recovery
- `mobile_scanner` now requires at least 5.1.1, where controller auto-start support is available.
- Camera start, stop, retry, app lifecycle, and disposal are serialized to avoid overlapping native camera operations.
- Scanner startup is explicit, and the patrol route screen prevents opening multiple scanner screens at once.
- Camera failures show permission/retry guidance instead of exposing the raw Android exception on screen.

## Android release build
- Gradle wrapper upgraded to 8.14.3 to meet the minimum required by the Flutter Gradle plugin.

## "Network unstable. Incident queued." (yellow message)
Cause: every failure (HTTP 400/401/404/500, timeout, real network loss) was caught by one
`catch` and reported as a network problem + queued. Now:
- No connection / timeout  -> queued, orange message says so
- HTTP 401                 -> queued, "session expired" message
- HTTP 5xx / 408 / 429     -> queued, message shows the HTTP status
- Other HTTP 4xx           -> NOT queued, form stays open, red message shows the server's reason
The same fix is applied to checkpoint scans (previously shown as "Dead Zone").

## Offline sync fixes
- Queued incidents were sent to /incidents; the live upload uses /api/v1/incidents -> fixed (shared ApiConfig).
- SyncService.initialize() added a new listener on every call -> now idempotent.
- Sync now also runs at startup, after login, every 60 s, and on demand (banner tap / Activity Log button).
- HTTP 409 (duplicate) is treated as already-synced.
- Banner counts scans AND incidents using COUNT(*) instead of decoding every photo each 3 s.

## Android / iOS
- CAMERA permission was nested inside <queries> (ineffective) -> moved to <manifest>.
- Added INTERNET, ACCESS_NETWORK_STATE, ACCESS_FINE/COARSE_LOCATION.
- iOS Info.plist: camera / location / photo usage strings.

## Cleanup (analyzer warnings)
super.key, State<...> createState, withOpacity -> withValues, unnecessary toList(), BuildContext across async gap (login).

## Files
New:      lib/config/api_config.dart, lib/services/api_client.dart
Rewritten: sync_service, incident_report_screen, locked_camera_screen, offline_banner
Edited:   dashboard, activity_log, patrol_route, login, incident_list, incident_thread,
          home_incidents_preview, local_db, incident_service, auth_service,
          AndroidManifest.xml, ios/Runner/Info.plist
