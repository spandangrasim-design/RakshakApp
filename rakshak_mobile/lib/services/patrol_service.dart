import 'dart:convert';
import 'package:http/http.dart' as http;

class PatrolService {
  static const String baseUrl = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

  // 1. Start Shift
  static Future<bool> startShift(String token) async {
    final res = await http.post(
      Uri.parse('$baseUrl/shifts/start'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );
    return res.statusCode == 200 || res.statusCode == 201;
  }

  // 2. Fetch Assigned Route & Checkpoints
  static Future<Map<String, dynamic>?> fetchAssignedRoute(String token) async {
    final res = await http.get(
      Uri.parse('$baseUrl/guards/my-assigned-route'),
      headers: {'Authorization': 'Bearer $token'},
    );

    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      if (data['success'] == true && data['has_route'] == true) {
        return data['route'];
      }
    }
    return null;
  }

  // 3. Submit Checkpoint Scan (GPS + Dual Photos)
  static Future<Map<String, dynamic>?> submitScan({
    required String token,
    required String clientScanId,
    required String checkpointId,
    required String qrLat,
    required String qrLng,
    required String signature,
    required double guardLat,
    required double guardLng,
    required String selfieBase64,
    required String locationPhotoBase64,
  }) async {
    final payload = {
      'client_scan_id': clientScanId,
      'checkpoint_id': checkpointId,
      'qr_lat': qrLat,
      'qr_lng': qrLng,
      'signature': signature,
      'guard_lat': guardLat,
      'guard_lng': guardLng,
      'selfie_url': selfieBase64,
      'location_photo_url': locationPhotoBase64,
    };

    final res = await http.post(
      Uri.parse('$baseUrl/scans'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(payload),
    );

    if (res.statusCode == 200) {
      return jsonDecode(res.body);
    }
    return null;
  }

  // 4. End Shift / Complete Patrol
  static Future<bool> endShift(String token) async {
    final res = await http.post(
      Uri.parse('$baseUrl/shifts/end'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );
    return res.statusCode == 200;
  }
}