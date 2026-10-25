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
  static const String shiftsBase = '$apiBase/shifts';
  static const String patrolSyncUrl = '$apiBase/patrols/sync';

  /// Assigned Route & Live Breadcrumb Tracking Endpoints
  static const String myAssignedRouteUrl = '$apiBase/guards/my-assigned-route';
  static const String sessionStartUrl = '$apiBase/patrols/session/start';
  static const String sessionPingUrl = '$apiBase/patrols/session/ping';
}