import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class AuthService {
  // Your live Cloudflare API URL
  static const String apiUrl = 'https://rakshak-api.spandangrasim.workers.dev/api/v1/auth/login';

  Future<Map<String, dynamic>> login(String employeeCode, String password) async {
    try {
      final response = await http.post(
        Uri.parse(apiUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'employee_code': employeeCode,
          'password': password,
          'device_id': 'mobile_app' // In production, fetch actual device ID
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        // Save the JWT token securely on the device
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('jwt_token', data['access_token']);
        await prefs.setString('guard_name', data['guard']['full_name']);
        
        return {'success': true, 'message': 'Login successful'};
      } else {
        // Return the exact error message from your Cloudflare API
        return {'success': false, 'message': data['message'] ?? 'Login failed'};
      }
    } catch (e) {
      return {'success': false, 'message': 'Network error. Please try again.'};
    }
  }
}