import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../services/token_store.dart';

import '../config/api_config.dart';
import '../services/api_client.dart';
import '../services/sync_service.dart';

import 'login_screen.dart';
import 'qr_scanner_screen.dart';
import 'incident_report_screen.dart';
import 'incident_list_screen.dart';
import 'patrol_route_screen.dart';
import 'activity_log_screen.dart';
import 'mobile_admin_access_screen.dart';
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
  bool _isSuperAdmin = false;
  int _incidentsRefreshTick = 0;

  // Fail-closed: every feature is off until the server says otherwise.
  Map<String, bool> _perms = {
    'patrol_route': false,
    'report_incident': false,
    'incident_tickets': false,
    'activity_log': false,
    'sync_queue': false,
    'incident_option_1_severity': false,
    'incident_option_2_category': false,
    'incident_option_3_group': false,
    'incident_option_4_title': false,
    'incident_option_5_description': false,
    'incident_option_6_photo': false,
  };

  @override
  void initState() {
    super.initState();
    _loadGuardData();
  }

  Future<void> _loadGuardData() async {
    final prefs = await SharedPreferences.getInstance();
    final savedGuardName = prefs.getString('guard_name') ?? 'Security Guard';
    final savedGuardId = prefs.getString('guard_id') ?? '';
    final savedToken = await TokenStore.read();
    final localShiftState = prefs.getBool('is_shift_active') ?? false;
    final cachedPermsJson = prefs.getString('app_permissions');
    final isSuper = prefs.getBool('is_super_admin') ?? false;

    if (cachedPermsJson != null && cachedPermsJson.isNotEmpty) {
      try {
        final decoded = jsonDecode(cachedPermsJson) as Map<String, dynamic>;
        decoded.forEach((k, v) {
          if (v is bool && _perms.containsKey(k)) _perms[k] = v;
        });
      } catch (_) {}
    }

    if (!mounted) return;
    setState(() {
      _guardName = savedGuardName;
      _guardId = savedGuardId;
      _token = savedToken;
      _isShiftActive = localShiftState;
      _isSuperAdmin = isSuper;
      _isLoadingPrefs = false;
    });

    if (_token.isNotEmpty) {
      SyncService().initialize();
      await Future.wait([
        _syncActiveShiftWithServer(),
        _syncAppPermissionsWithServer(),
      ]);
    }
  }

  Future<void> _syncAppPermissionsWithServer() async {
    try {
      final response = await http.get(
        Uri.parse('${ApiConfig.apiBase}/guards/my-permissions'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      ).timeout(const Duration(seconds: 8));

      // Account disabled or organization suspended: sign out instead of showing stale features.
      if (response.statusCode == 401 || response.statusCode == 403) {
        await _handleLogout();
        return;
      }

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['app_permissions'] is Map) {
          // REPLACE, never merge: a key the server omits must become false, not keep an old true.
          final serverPerms = Map<String, dynamic>.from(data['app_permissions']);
          final updated = <String, bool>{
            for (final k in _perms.keys) k: serverPerms[k] == true,
          };

          final isSuper = data['is_super_admin'] == true;
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('app_permissions', jsonEncode(updated));
          await prefs.setString(
              'incident_form_fields', jsonEncode(data['incident_form_fields'] ?? []));
          await prefs.setBool('is_super_admin', isSuper);

          if (mounted) {
            setState(() {
              _perms = updated;
              _isSuperAdmin = isSuper;
            });
          }
        }
      }
    } catch (_) {}
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
          content: Text(targetState ? 'Shift Started and logged online.' : 'Shift Ended and logged online.'),
          backgroundColor: targetState ? Colors.green.shade700 : Colors.orange.shade800,
        ),
      );
    } else {
      messenger.showSnackBar(
        SnackBar(
          content: Text('Shift ${targetState ? 'started' : 'ended'} on this device only. Server: ${outcome.describe}'),
          backgroundColor: Colors.red.shade900,
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
    await TokenStore.clear();
    await prefs.clear();

    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Dynamic gate checks: true = render, false = completely omit
    final canPatrolRoute = _perms['patrol_route'] == true;
    final canReportIncident = _perms['report_incident'] == true;
    final canViewTickets = _perms['incident_tickets'] == true;
    final canActivityLog = _perms['activity_log'] == true;
    final canSyncQueue = _perms['sync_queue'] == true;

    // Build the grid list dynamically
    final activeCards = <Widget>[
      if (_showStandaloneScanCheckpoint)
        _buildActionCard(
          icon: Icons.qr_code_scanner,
          title: 'Scan Checkpoint',
          subtitle: 'QR verification',
          color: const Color(0xFF2563EB),
          onTap: () async {
            final result = await Navigator.push(
              context,
              MaterialPageRoute(builder: (context) => const QrScannerScreen()),
            );
            if (result != null && result is bool) {
              setState(() => _lastScanVerified = result);
            }
          },
        ),
      if (canPatrolRoute)
        _buildActionCard(
          icon: Icons.map_outlined,
          title: 'Patrol Route',
          subtitle: 'Assigned stops',
          color: const Color(0xFF0D9488),
          onTap: () {
            Navigator.push(context, MaterialPageRoute(builder: (context) => const PatrolRouteScreen()));
          },
        ),
      if (canReportIncident)
        _buildActionCard(
          icon: Icons.warning_amber_rounded,
          title: 'Report Incident',
          subtitle: 'Log security issue',
          color: const Color(0xFFDC2626),
          onTap: _navigateToReportIncident,
        ),
      if (canViewTickets)
        _buildActionCard(
          icon: Icons.assignment_outlined,
          title: 'Incident Tickets',
          subtitle: 'Active & resolved',
          color: const Color(0xFFE11D48),
          onTap: _navigateToIncidentList,
        ),
      if (canActivityLog)
        _buildActionCard(
          icon: Icons.history,
          title: 'Activity Log',
          subtitle: 'Recent scans',
          color: const Color(0xFF475569),
          onTap: () {
            Navigator.push(context, MaterialPageRoute(builder: (context) => const ActivityLogScreen()));
          },
        ),
      if (canSyncQueue)
        _buildActionCard(
          icon: Icons.sync,
          title: 'Sync Queue',
          subtitle: 'Force upload',
          color: const Color(0xFF7C3AED),
          onTap: () async {
            SyncService().initialize();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Checking and uploading offline queue...'), duration: Duration(seconds: 2)),
            );
          },
        ),
      if (_isSuperAdmin)
        _buildActionCard(
          icon: Icons.admin_panel_settings,
          title: 'Staff Access Control',
          subtitle: 'Super Admin only',
          color: const Color(0xFF7C3AED),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => MobileAdminAccessScreen(token: _token),
              ),
            ).then((_) => _syncAppPermissionsWithServer());
          },
        ),
    ];

    return Scaffold(
      backgroundColor: const Color(0xFFF5F8FC),
      appBar: AppBar(
        title: const Text('Rakshak Patrol', style: TextStyle(fontWeight: FontWeight.w800)),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF172B4D),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        actions: [
          if (canViewTickets)
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
                await Future.wait([
                  _syncActiveShiftWithServer(),
                  _syncAppPermissionsWithServer(),
                ]);
                if (mounted) setState(() => _incidentsRefreshTick++);
              },
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Premium officer identity panel
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF17345F), Color(0xFF245BDB)],
                        ),
                        borderRadius: BorderRadius.circular(22),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF245BDB).withOpacity(0.18),
                            blurRadius: 24,
                            offset: const Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 48,
                                height: 48,
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.14),
                                  borderRadius: BorderRadius.circular(15),
                                  border: Border.all(color: Colors.white.withOpacity(0.22)),
                                ),
                                child: const Icon(Icons.shield_rounded, size: 26, color: Colors.white),
                              ),
                              const SizedBox(width: 13),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'WELCOME BACK',
                                      style: TextStyle(
                                        color: Colors.white.withOpacity(0.72),
                                        fontSize: 10,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 1.25,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      _guardName,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: Colors.white),
                                    ),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(30),
                                  border: Border.all(color: Colors.white.withOpacity(0.2)),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.verified_user_outlined, size: 13, color: Colors.white),
                                    SizedBox(width: 5),
                                    Text('RAKSHAK', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: .7)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 18),
                          Row(
                            children: [
                              Icon(Icons.badge_outlined, size: 15, color: Colors.white.withOpacity(.75)),
                              const SizedBox(width: 7),
                              Expanded(
                                child: Text(
                                  _guardId.isNotEmpty ? 'Officer ID  $_guardId' : 'Security Operations',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: Colors.white.withOpacity(.82), fontSize: 11, fontWeight: FontWeight.w600),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Text(
                                MaterialLocalizations.of(context).formatShortDate(DateTime.now()),
                                style: TextStyle(color: Colors.white.withOpacity(.72), fontSize: 11, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Shift control panel
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xFFE3EAF4)),
                        boxShadow: [
                          BoxShadow(color: const Color(0xFF17345F).withOpacity(.045), blurRadius: 16, offset: const Offset(0, 5)),
                        ],
                      ),
                      child: Row(
                        children: [
                          Container(
                            height: 42,
                            width: 42,
                            decoration: BoxDecoration(
                              color: _isShiftActive ? const Color(0xFFEAF8F1) : const Color(0xFFFFF6E5),
                              borderRadius: BorderRadius.circular(13),
                            ),
                            child: Icon(
                              _isShiftActive ? Icons.check_circle_rounded : Icons.pause_circle_filled_rounded,
                              color: _isShiftActive ? const Color(0xFF12805C) : const Color(0xFFB7791F),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _isShiftActive ? 'You are on duty' : 'You are off duty',
                                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF172B4D)),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  _isShiftActive ? 'Your patrol shift is active' : 'Start your shift to begin patrol operations',
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF718198)),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          FilledButton(
                            onPressed: _isShiftLoading ? null : _toggleShift,
                            style: FilledButton.styleFrom(
                              backgroundColor: _isShiftActive ? const Color(0xFFB42318) : const Color(0xFF245BDB),
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: _isShiftLoading
                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : Text(_isShiftActive ? 'End Shift' : 'Start Shift', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 22),

                    // Active Tickets Preview (Only renders if tickets module is licensed)
                    if (canViewTickets && !_isLoadingPrefs && _guardId.isNotEmpty && _token.isNotEmpty) ...[
                      HomeIncidentsPreview(
                        guardId: _guardId,
                        token: _token,
                        guardName: _guardName,
                        refreshTick: _incidentsRefreshTick,
                      ),
                      const SizedBox(height: 22),
                    ],

                    if (_lastScanVerified != null) ...[
                      Container(
                        margin: const EdgeInsets.only(bottom: 20),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _lastScanVerified! ? Colors.green.shade50 : Colors.orange.shade50,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _lastScanVerified! ? Colors.green.shade200 : Colors.orange.shade300),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _lastScanVerified! ? Icons.verified_user : Icons.warning_amber_rounded,
                              color: _lastScanVerified! ? Colors.green.shade700 : Colors.orange.shade800,
                              size: 28,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _lastScanVerified! ? 'Checkpoint verified successfully.' : 'Geofence warning: location audit flagged.',
                                style: TextStyle(fontWeight: FontWeight.bold, color: _lastScanVerified! ? Colors.green.shade900 : Colors.orange.shade900),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const Text(
                      'Operations',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF172B4D), letterSpacing: -.3),
                    ),
                    const SizedBox(height: 3),
                    const Text(
                      'Quick access to your assigned security activities',
                      style: TextStyle(fontSize: 11, color: Color(0xFF718198), fontWeight: FontWeight.w500),
                    ),
                    const SizedBox(height: 13),

                    // Dynamic Grid: Contains only active, licensed cards
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 2,
                      crossAxisSpacing: 14,
                      mainAxisSpacing: 14,
                      childAspectRatio: 1.02,
                      children: activeCards,
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
      borderRadius: BorderRadius.circular(19),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(19),
        child: Container(
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(19),
            border: Border.all(color: const Color(0xFFE3EAF4)),
            boxShadow: [
              BoxShadow(color: const Color(0xFF17345F).withOpacity(.045), blurRadius: 16, offset: const Offset(0, 5)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    width: 43,
                    height: 43,
                    decoration: BoxDecoration(color: color.withOpacity(.10), borderRadius: BorderRadius.circular(14)),
                    child: Icon(icon, color: color, size: 23),
                  ),
                  Container(
                    width: 27,
                    height: 27,
                    decoration: BoxDecoration(color: const Color(0xFFF4F7FC), borderRadius: BorderRadius.circular(9)),
                    child: const Icon(Icons.arrow_outward_rounded, size: 15, color: Color(0xFF718198)),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF172B4D))),
                  const SizedBox(height: 3),
                  Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10.5, height: 1.3, color: Color(0xFF718198))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
