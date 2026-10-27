import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../services/api_client.dart';
import '../services/sync_service.dart';

import 'login_screen.dart';
import 'qr_scanner_screen.dart';
import 'incident_report_screen.dart';
import 'incident_list_screen.dart';
import 'patrol_route_screen.dart';
import 'activity_log_screen.dart';
import '../widgets/offline_banner.dart';
import '../widgets/home_incidents_preview.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  static const bool _showStandaloneScanCheckpoint = false;

  String _guardName = 'Guard';
  String _guardId = '';
  String _token = '';
  bool _isShiftActive = false;
  bool _isShiftLoading = false;
  bool? _lastScanVerified;
  bool _isLoadingPrefs = true;
  int _incidentsRefreshTick = 0;

  @override
  void initState() {
    super.initState();
    _loadGuardData();
  }

  Future<void> _loadGuardData() async {
    final prefs = await SharedPreferences.getInstance();
    final savedGuardName = prefs.getString('guard_name') ?? 'Security Guard';
    final savedGuardId = prefs.getString('guard_id') ?? '';
    final savedToken =
        prefs.getString('access_token') ?? prefs.getString('token') ?? '';
    final localShiftState = prefs.getBool('is_shift_active') ?? false;

    if (!mounted) return;
    setState(() {
      _guardName = savedGuardName;
      _guardId = savedGuardId;
      _token = savedToken;
      _isShiftActive = localShiftState;
      _isLoadingPrefs = false;
    });

    if (_token.isNotEmpty) {
      SyncService().initialize();
      await _syncActiveShiftWithServer();
    }
  }

  Future<void> _syncActiveShiftWithServer() async {
    try {
      final response = await http.get(
        Uri.parse('${ApiConfig.shiftsBase}/active'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      ).timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true) {
          final bool serverShiftActive = data['is_active'] == true;
          final prefs = await SharedPreferences.getInstance();
          await prefs.setBool('is_shift_active', serverShiftActive);

          if (mounted) {
            setState(() {
              _isShiftActive = serverShiftActive;
            });
          }
        }
      }
    } catch (_) {}
  }

  Future<void> _toggleShift() async {
    if (_isShiftLoading) return;

    setState(() => _isShiftLoading = true);

    final endpoint = _isShiftActive ? 'end' : 'start';
    final targetState = !_isShiftActive;

    final outcome = await ApiClient.postJson(
      '${ApiConfig.shiftsBase}/$endpoint',
      token: _token,
      body: const <String, dynamic>{},
      timeout: const Duration(seconds: 10),
    );

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('is_shift_active', targetState);

    if (!mounted) return;
    setState(() {
      _isShiftActive = targetState;
      _isShiftLoading = false;
    });

    final messenger = ScaffoldMessenger.of(context);
    if (outcome.ok) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(targetState
              ? 'Shift Started and logged online.'
              : 'Shift Ended and logged online.'),
          backgroundColor:
              targetState ? Colors.green.shade700 : Colors.orange.shade800,
        ),
      );
    } else {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Shift ${targetState ? 'started' : 'ended'} on this device only. '
            'Server: ${outcome.describe}',
            style: const TextStyle(fontSize: 12),
          ),
          backgroundColor: Colors.red.shade900,
          duration: const Duration(seconds: 8),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _navigateToIncidentList() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => IncidentListScreen(
          guardId: _guardId,
          token: _token,
          guardName: _guardName,
        ),
      ),
    ).then((_) {
      if (mounted) setState(() => _incidentsRefreshTick++);
    });
  }

  void _navigateToReportIncident() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const IncidentReportScreen(),
      ),
    ).then((_) {
      if (mounted) setState(() => _incidentsRefreshTick++);
    });
  }

  Future<void> _handleLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();

    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Rakshak Patrol',
            style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.assignment_outlined),
            tooltip: 'My Incidents',
            onPressed: _navigateToIncidentList,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: _handleLogout,
          ),
        ],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                await _syncActiveShiftWithServer();
                if (mounted) setState(() => _incidentsRefreshTick++);
              },
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Welcome Card
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.03),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 26,
                            backgroundColor:
                                const Color(0xFF1E3A8A).withValues(alpha: 0.1),
                            child: const Icon(Icons.shield_outlined,
                                size: 28, color: Color(0xFF1E3A8A)),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'On-Duty Security Officer',
                                  style: TextStyle(
                                      color: Color(0xFF64748B),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  _guardName,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF0F172A),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Shift Status Banner
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: _isShiftActive
                            ? const Color(0xFFECFDF5)
                            : const Color(0xFFFFFBEB),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: _isShiftActive
                              ? const Color(0xFFA7F3D0)
                              : const Color(0xFFFDE68A),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            _isShiftActive
                                ? Icons.check_circle
                                : Icons.pause_circle_filled,
                            color: _isShiftActive
                                ? Colors.green.shade700
                                : Colors.amber.shade800,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _isShiftActive
                                  ? 'Active Patrol Shift'
                                  : 'Off-Duty (No Active Shift)',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: _isShiftActive
                                    ? Colors.green.shade900
                                    : Colors.amber.shade900,
                              ),
                            ),
                          ),
                          ElevatedButton(
                            onPressed: _isShiftLoading ? null : _toggleShift,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _isShiftActive
                                  ? Colors.red.shade600
                                  : const Color(0xFF1E3A8A),
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10)),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                            ),
                            child: _isShiftLoading
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white),
                                  )
                                : Text(
                                    _isShiftActive ? 'End Shift' : 'Start Shift',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold),
                                  ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Active Incidents Preview Widget (Aligned flush with cards above)
                    if (!_isLoadingPrefs &&
                        _guardId.isNotEmpty &&
                        _token.isNotEmpty) ...[
                      HomeIncidentsPreview(
                        guardId: _guardId,
                        token: _token,
                        guardName: _guardName,
                        refreshTick: _incidentsRefreshTick,
                      ),
                      const SizedBox(height: 22),
                    ],

                    if (_lastScanVerified != null)
                      Container(
                        margin: const EdgeInsets.only(bottom: 20),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _lastScanVerified!
                              ? Colors.green.shade50
                              : Colors.orange.shade50,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _lastScanVerified!
                                ? Colors.green.shade200
                                : Colors.orange.shade300,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _lastScanVerified!
                                  ? Icons.verified_user
                                  : Icons.warning_amber_rounded,
                              color: _lastScanVerified!
                                  ? Colors.green.shade700
                                  : Colors.orange.shade800,
                              size: 28,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _lastScanVerified!
                                        ? 'Scan Verified'
                                        : 'Geofence Warning (Amber Flag)',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: _lastScanVerified!
                                          ? Colors.green.shade900
                                          : Colors.orange.shade900,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _lastScanVerified!
                                        ? 'Location perfectly matched checkpoint coordinates.'
                                        : 'Your scan location was > 50 meters from the checkpoint. Flagged for admin audit.',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: _lastScanVerified!
                                          ? Colors.green.shade700
                                          : Colors.orange.shade800,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),

                    const Text(
                      'Patrol Actions',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0F172A)),
                    ),
                    const SizedBox(height: 12),

                    // Action Grid
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 2,
                      crossAxisSpacing: 14,
                      mainAxisSpacing: 14,
                      childAspectRatio: 1.15,
                      children: [
                        if (_showStandaloneScanCheckpoint)
                          _buildActionCard(
                            icon: Icons.qr_code_scanner,
                            title: 'Scan Checkpoint',
                            subtitle: 'QR verification',
                            color: const Color(0xFF2563EB),
                            onTap: () async {
                              final result = await Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (context) =>
                                        const QrScannerScreen()),
                              );

                              if (result != null && result is bool) {
                                setState(() => _lastScanVerified = result);
                              } else if (result == null) {
                                setState(() => _lastScanVerified = null);
                              }
                            },
                          ),
                        _buildActionCard(
                          icon: Icons.map_outlined,
                          title: 'Patrol Route',
                          subtitle: 'Assigned stops',
                          color: const Color(0xFF0D9488),
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (context) =>
                                      const PatrolRouteScreen()),
                            );
                          },
                        ),
                        _buildActionCard(
                          icon: Icons.warning_amber_rounded,
                          title: 'Report Incident',
                          subtitle: 'Log security issue',
                          color: const Color(0xFFDC2626),
                          onTap: _navigateToReportIncident,
                        ),
                        _buildActionCard(
                          icon: Icons.assignment_outlined,
                          title: 'Incident Tickets',
                          subtitle: 'Active & resolved',
                          color: const Color(0xFFE11D48),
                          onTap: _navigateToIncidentList,
                        ),
                        _buildActionCard(
                          icon: Icons.history,
                          title: 'Activity Log',
                          subtitle: 'Recent scans',
                          color: const Color(0xFF475569),
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (context) =>
                                      const ActivityLogScreen()),
                            );
                          },
                        ),
                        _buildActionCard(
                          icon: Icons.sync,
                          title: 'Sync Queue',
                          subtitle: 'Force upload',
                          color: const Color(0xFF7C3AED),
                          onTap: () async {
                            SyncService().initialize();
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Checking and uploading offline queue...'),
                                duration: Duration(seconds: 2),
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE2E8F0)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.02),
                blurRadius: 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircleAvatar(
                radius: 21,
                backgroundColor: color.withValues(alpha: 0.12),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(height: 10),
              Text(
                title,
                style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: Color(0xFF0F172A)),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}