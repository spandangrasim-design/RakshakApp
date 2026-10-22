import 'dart:convert';
import 'package:http/http.dart' as http;

class IncidentService {
  static const String baseUrl = "https://rakshak-api.spandangrasim.workers.dev/api/v1";

  static Future<List<dynamic>> fetchIncidents(String token) async {
    final response = await http.get(
      Uri.parse('$baseUrl/incidents'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode == 200) return jsonDecode(response.body)['incidents'];
    throw Exception('Failed to load incidents');
  }

  static Future<Map<String, dynamic>> fetchIncidentDetails(String incidentId, String token) async {
    final response = await http.get(
      Uri.parse('$baseUrl/incidents/$incidentId'),
      headers: {'Authorization': 'Bearer $token'},
    );
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
        'sender_type': 'GUARD',
        'sender_name': guardName,
        'message': message,
        'photo_base64': base64Photo,
      }),
    );
    return response.statusCode == 200;
  }
}