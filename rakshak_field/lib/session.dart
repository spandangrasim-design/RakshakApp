import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Holds who this device is. The token lives in encrypted storage; the rest is non-secret.
class Session {
  static const FlutterSecureStorage _secure = FlutterSecureStorage();

  static String? token;
  static String deviceId = '';
  static Map<String, dynamic> profile = {};
  static Map<String, dynamic> permissions = {};
  static List<String> formFields = [];

  static bool get signedIn => token != null && token!.isNotEmpty;
  static String get name => (profile['full_name'] ?? '').toString();
  static String get industry => (profile['tenant_name'] ?? '').toString();

  static bool can(String permission) => permissions[permission] == true;

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();

    deviceId = prefs.getString('device_id') ?? '';
    if (deviceId.isEmpty) {
      deviceId = const Uuid().v4();
      await prefs.setString('device_id', deviceId);
    }

    try {
      token = await _secure.read(key: 'token');
    } catch (_) {
      token = null;
    }

    profile = _readMap(prefs.getString('profile'));
    permissions = _readMap(prefs.getString('permissions'));
    formFields = _readList(prefs.getString('form_fields'));
  }

  static Future<void> save({
    required String accessToken,
    required Map<String, dynamic> guard,
    required Map<String, dynamic> perms,
    required List<String> fields,
  }) async {
    token = accessToken;
    profile = guard;
    await _secure.write(key: 'token', value: accessToken);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('profile', jsonEncode(guard));
    await updateAccess(perms, fields);
  }

  /// Called whenever the server tells us what this guard may do (after the admin changes access).
  static Future<void> updateAccess(Map<String, dynamic> perms, List<String> fields) async {
    permissions = perms;
    formFields = fields;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('permissions', jsonEncode(perms));
    await prefs.setString('form_fields', jsonEncode(fields));
  }

  static Future<void> clear() async {
    token = null;
    profile = {};
    permissions = {};
    formFields = [];
    try {
      await _secure.delete(key: 'token');
    } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('profile');
    await prefs.remove('permissions');
    await prefs.remove('form_fields');
  }

  static Map<String, dynamic> _readMap(String? raw) {
    if (raw == null || raw.isEmpty) return {};
    try {
      final d = jsonDecode(raw);
      if (d is Map) return Map<String, dynamic>.from(d);
    } catch (_) {}
    return {};
  }

  static List<String> _readList(String? raw) {
    if (raw == null || raw.isEmpty) return [];
    try {
      final d = jsonDecode(raw);
      if (d is List) return d.map((e) => e.toString()).toList();
    } catch (_) {}
    return [];
  }
}
