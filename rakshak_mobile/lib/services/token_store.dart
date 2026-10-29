import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Keeps the login token in the platform's encrypted store (Android Keystore / iOS Keychain)
/// instead of plain-text SharedPreferences.
class TokenStore {
  static const _storage = FlutterSecureStorage();
  static const _key = 'access_token';

  static Future<String> read() async {
    try {
      final t = await _storage.read(key: _key);
      if (t != null && t.isNotEmpty) return t;
    } catch (_) {
      // fall through to the one-time migration below
    }

    // One-time migration: older app versions stored the token in plain text.
    final prefs = await SharedPreferences.getInstance();
    final legacy =
        prefs.getString('access_token') ?? prefs.getString('token') ?? '';
    if (legacy.isNotEmpty) {
      await write(legacy);
    }
    await prefs.remove('access_token');
    await prefs.remove('token');
    await prefs.remove('jwt_token');
    return legacy;
  }

  static Future<void> write(String token) async {
    try {
      await _storage.write(key: _key, value: token);
    } catch (_) {}
  }

  static Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    await prefs.remove('token');
    await prefs.remove('jwt_token');
  }
}
