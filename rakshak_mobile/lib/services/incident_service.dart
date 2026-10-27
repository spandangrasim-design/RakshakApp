import 'dart:convert';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class IncidentService {
  static const String baseUrl = ApiConfig.apiBase;

  static const List<String> defaultGroups = [
    'Security Operations L1',
    'Quick Response Team (QRT)',
    'Site Supervisors L2',
    'Fire & Safety Response',
  ];

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

  static Future<List<String>> fetchAssignmentGroups() async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/admin/configs'))
          .timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['configs'] is List) {
          for (final item in data['configs']) {
            if (item['key_name'] == 'CUSTOM_ASSIGNMENT_GROUPS' &&
                item['key_value'] != null) {
              final parsed = jsonDecode(item['key_value']);
              if (parsed is List && parsed.isNotEmpty) {
                return parsed.map((e) => e.toString()).toList();
              }
            }
          }
        }
      }
    } catch (_) {}
    return defaultGroups;
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