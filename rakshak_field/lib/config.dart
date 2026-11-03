class AppConfig {
  /// Override at build time with --dart-define=API_BASE=https://your-api/api/v1
  static const String apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://rakshak-api.spandangrasim.workers.dev/api/v1',
  );
}
