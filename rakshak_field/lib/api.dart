import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'session.dart';

class ApiException implements Exception {
  final String message;
  final int? status;
  final Map<String, dynamic> body;

  ApiException(this.message, {this.status, this.body = const {}});

  @override
  String toString() => message;
}

class Api {
  /// Set by main.dart: send the guard back to the join screen.
  static void Function()? onUnauthorized;

  static Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final uri = Uri.parse('${AppConfig.apiBase}$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (auth && Session.token != null) {
      headers['Authorization'] = 'Bearer ${Session.token}';
    }

    http.Response res;
    try {
      if (method == 'POST') {
        res = await http
            .post(uri, headers: headers, body: jsonEncode(body ?? {}))
            .timeout(timeout);
      } else {
        res = await http.get(uri, headers: headers).timeout(timeout);
      }
    } on TimeoutException {
      throw ApiException('The server took too long. Check your internet and try again.');
    } catch (_) {
      throw ApiException('No internet connection. Please try again.');
    }

    Map<String, dynamic> data = {};
    try {
      final d = jsonDecode(res.body);
      if (d is Map) data = Map<String, dynamic>.from(d);
    } catch (_) {}

    final message = (data['message'] ?? '').toString();

    final suspended = res.statusCode == 403 && message.toLowerCase().contains('suspended');
    if (auth && (res.statusCode == 401 || suspended)) {
      await Session.clear();
      onUnauthorized?.call();
      throw ApiException('Your session has ended. Please join again.', status: res.statusCode);
    }

    if (res.statusCode >= 400) {
      throw ApiException(
        message.isNotEmpty ? message : 'Something went wrong (${res.statusCode}).',
        status: res.statusCode,
        body: data,
      );
    }
    return data;
  }

  // ---------- joining (no login) ----------
  static Future<List<Map<String, dynamic>>> industries() async {
    final d = await _request('GET', '/guest/industries', auth: false);
    final list = (d['industries'] as List?) ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  static Future<void> register({
    required String tenantId,
    required String joinCode,
    required String fullName,
    required String phone,
    required String selfieBase64,
  }) async {
    final d = await _request(
      'POST',
      '/guest/register',
      auth: false,
      timeout: const Duration(seconds: 60),
      body: {
        'tenant_id': tenantId,
        'join_code': joinCode,
        'full_name': fullName,
        'phone': phone,
        'device_id': Session.deviceId,
        'selfie': selfieBase64,
      },
    );
    await Session.save(
      accessToken: d['access_token'].toString(),
      guard: Map<String, dynamic>.from(d['guard'] as Map),
      perms: Map<String, dynamic>.from((d['app_permissions'] as Map?) ?? {}),
      fields: ((d['incident_form_fields'] as List?) ?? []).map((e) => e.toString()).toList(),
    );
  }

  // ---------- routes ----------
  static Future<List<Map<String, dynamic>>> routes() async {
    final d = await _request('GET', '/field/routes');
    await Session.updateAccess(
      Map<String, dynamic>.from((d['app_permissions'] as Map?) ?? {}),
      ((d['incident_form_fields'] as List?) ?? []).map((e) => e.toString()).toList(),
    );
    final list = (d['routes'] as List?) ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  static Future<String> startRun(String roundId) async {
    final d = await _request('POST', '/field/runs/start', body: {'round_id': roundId});
    return d['session_id'].toString();
  }

  static Future<String?> completeRun(String sessionId) async {
    final d = await _request('POST', '/field/runs/$sessionId/complete');
    return d['done_at']?.toString();
  }

  // ---------- scan + incident ----------
  static Future<void> submitScan({
    required String checkpointId,
    required String qrLat,
    required String qrLng,
    required String signature,
    required double guardLat,
    required double guardLng,
    required String clientScanId,
  }) async {
    await _request(
      'POST',
      '/scans',
      body: {
        'client_scan_id': clientScanId,
        'checkpoint_id': checkpointId,
        'qr_lat': qrLat,
        'qr_lng': qrLng,
        'signature': signature,
        'guard_lat': guardLat,
        'guard_lng': guardLng,
        'uptime_seconds': 0,
      },
    );
  }

  static Future<void> createIncident(Map<String, dynamic> payload) async {
    await _request('POST', '/incidents', body: payload, timeout: const Duration(seconds: 60));
  }
}
