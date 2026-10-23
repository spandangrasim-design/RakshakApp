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
          'device_id': 'mobile_app',
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        final prefs = await SharedPreferences.getInstance();

        final String token = data['access_token'] ?? '';
        final String guardId = data['guard']?['guard_id'] ?? '';
        final String guardName = data['guard']?['full_name'] ?? 'Security Guard';

        // Save token across all key variants used in the app
        await prefs.setString('access_token', token);
        await prefs.setString('token', token);
        await prefs.setString('jwt_token', token);

        // Save guard credentials
        await prefs.setString('guard_id', guardId);
        await prefs.setString('guard_name', guardName);

        return {'success': true, 'message': 'Login successful'};
      } else {
        return {'success': false, 'message': data['message'] ?? 'Login failed'};
      }
    } catch (e) {
      return {'success': false, 'message': 'Network error. Please try again.'};
    }
  }
}