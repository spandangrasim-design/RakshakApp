import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';

class AuthService {
  static const String apiUrl = ApiConfig.loginUrl;

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
      ).timeout(const Duration(seconds: 12));

      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        final prefs = await SharedPreferences.getInstance();

        final String token = data['access_token'] ?? '';
        final guard = data['guard'] ?? {};
        final String guardId = guard['guard_id'] ?? '';
        final String guardName = guard['full_name'] ?? 'Security Guard';
        final String guardRole = guard['role'] ?? 'Guard';
        final String tenantId = guard['tenant_id'] ?? '';
        final bool isSuperAdmin = guard['is_super_admin'] == true;

        // 1. Session tokens
        await prefs.setString('access_token', token);
        await prefs.setString('token', token);
        await prefs.setString('jwt_token', token);

        // 2. Profile identity
        await prefs.setString('guard_id', guardId);
        await prefs.setString('guard_name', guardName);
        await prefs.setString('guard_role', guardRole);
        await prefs.setString('tenant_id', tenantId);
        await prefs.setBool('is_super_admin', isSuperAdmin);

        // 3. User & Tenant resolved permissions (for instant UI gating)
        if (data['app_permissions'] != null) {
          await prefs.setString(
            'app_permissions',
            jsonEncode(data['app_permissions']),
          );
        }

        await prefs.setString(
          'incident_form_fields',
          jsonEncode(data['incident_form_fields'] ?? []),
        );
        await prefs.setString('tier', (guard['tier'] ?? 'USER').toString());

        // 4. Tenant licensed module visibility
        if (data['visible_modules'] != null) {
          await prefs.setString(
            'visible_modules',
            jsonEncode(data['visible_modules']),
          );
        }

        return {'success': true, 'message': 'Login successful', 'data': data};
      } else {
        return {'success': false, 'message': data['message'] ?? 'Login failed'};
      }
    } catch (e) {
      return {'success': false, 'message': 'Network error. Please try again.'};
    }
  }
}