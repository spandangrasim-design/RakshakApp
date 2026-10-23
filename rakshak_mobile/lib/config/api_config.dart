/// Single place for every backend URL used by the app.
class ApiConfig {
  ApiConfig._();

  /// Your deployed Cloudflare Worker.
  static const String host = 'https://rakshak-api.spandangrasim.workers.dev';

  /// Versioned API root.
  static const String apiBase = '$host/api/v1';

  static const String loginUrl = '$apiBase/auth/login';
  static const String incidentsUrl = '$apiBase/incidents';
  static const String scansUrl = '$apiBase/scans';
  static const String roundsUrl = '$apiBase/rounds';

  // NOTE: In the original code these two were called WITHOUT the /api/v1
  // prefix. They are kept exactly as they were because the Worker routes
  // can't be seen from the app. If the app now reports "HTTP 404" for shifts
  // or for syncing offline scans, change them to '$apiBase/shifts' and
  // '$apiBase/patrols/sync'.
  static const String shiftsBase = '$host/shifts';
  static const String patrolSyncUrl = '$host/patrols/sync';
}
