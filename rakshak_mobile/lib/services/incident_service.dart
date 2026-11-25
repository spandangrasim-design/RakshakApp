import 'dart:convert';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class IncidentService {
  static const String baseUrl = ApiConfig.apiBase;

  static Future<List<String>> fetchCategories(String token) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/incident-categories'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));
      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        final rows = decoded['categories'] as List<dynamic>? ?? [];
        final names = rows.map((e) => (e['name'] ?? '').toString()).where((e) => e.isNotEmpty).toList();
        if (names.isNotEmpty) return names;
      }
    } catch (_) {}
    return ['Security / Patrol', 'Asset Breach', 'Fire / Hazard', 'Access Control'];
  }


  static Future<List<dynamic>> fetchIncidents(String token) async {
    final response = await http.get(
      Uri.parse('$baseUrl/incidents'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 12));

    if (response.statusCode == 200) {
      final decoded = jsonDecode(response.body);
      return (decoded['incidents'] as List<dynamic>?) ?? [];
    }
    throw Exception('Failed to load incidents');
  }

  static Future<Map<String, dynamic>> fetchIncidentDetails(
      String incidentId, String token) async {
    final response = await http.get(
      Uri.parse('$baseUrl/incidents/$incidentId'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 12));

    if (response.statusCode == 200) return jsonDecode(response.body);
    throw Exception('Failed to load incident details');
  }

  static Future<bool> postIncidentUpdate({
    required String incidentId,
    required String token,
    required String guardName,
    required String message,
    String? base64Photo,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/incidents/$incidentId/updates'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'sender_type': 'guard',
        'sender_name': guardName,
        'message': message,
        'photo_base64': base64Photo,
      }),
    );
    return response.statusCode == 200;
  }
}