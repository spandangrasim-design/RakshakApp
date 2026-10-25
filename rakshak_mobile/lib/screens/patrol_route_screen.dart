import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import 'qr_scanner_screen.dart';
import 'locked_camera_screen.dart';

class PatrolRouteScreen extends StatefulWidget {
  const PatrolRouteScreen({super.key});

  @override
  State<PatrolRouteScreen> createState() => _PatrolRouteScreenState();
}

class _PatrolRouteScreenState extends State<PatrolRouteScreen> {
  bool _isLoading = true;
  String _token = '';
  List<dynamic> _assignedRoutes = [];
  int _selectedRouteIndex = 0;
  String _statusMessage = 'No Route Assigned';
  final Set<String> _verifiedCheckpointIds = {};

  // Live Breadcrumb Tracking State
  Timer? _breadcrumbTimer;
  String? _activeSessionId;
  String? _activeTrackingRoundId;
  bool _isLiveTracking = false;
  int _pingCount = 0;
  String _lastPingTime = '';

  @override
  void initState() {
    super.initState();
    _loadSessionAndRoutes();
  }

  @override
  void dispose() {
    _breadcrumbTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadSessionAndRoutes() async {
    setState(() => _isLoading = true);

    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('access_token') ?? prefs.getString('token') ?? '';

    if (_token.isEmpty) {
      if (mounted) {
        setState(() {
          _statusMessage = 'Please log in again';
          _isLoading = false;
        });
      }
      return;
    }

    await _fetchAssignedRoutes();

    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchAssignedRoutes() async {
    try {
      final res = await http.get(
        Uri.parse(ApiConfig.myAssignedRouteUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true && data['has_route'] == true) {
          final List routes = data['routes'] ?? (data['route'] != null ? [data['route']] : []);
          _assignedRoutes = routes;
          if (_selectedRouteIndex >= _assignedRoutes.length) {
            _selectedRouteIndex = 0;
          }
        } else {
          _assignedRoutes = [];
          _statusMessage = data['message'] ?? 'No Route Assigned';
        }
      }
    } catch (e) {
      debugPrint('Error fetching assigned routes: $e');
    }
  }

  // Starts live 15-second GPS breadcrumb tracking when Stop #1 is verified
  Future<void> _startLivePatrolSession(String roundId) async {
    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
        );
      } catch (_) {}

      final res = await http.post(
        Uri.parse(ApiConfig.sessionStartUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
        body: jsonEncode({
          'round_id': roundId,
          'lat': pos?.latitude,
          'lng': pos?.longitude,
        }),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true && data['session'] != null) {
          _breadcrumbTimer?.cancel();
          setState(() {
            _activeSessionId = data['session']['id']?.toString();
            _activeTrackingRoundId = roundId;
            _isLiveTracking = true;
            _pingCount = 1;
            _lastPingTime = TimeOfDay.now().format(context);
          });

          // Ping GPS every 15 seconds while guard walks to the next checkpoint
          _breadcrumbTimer = Timer.periodic(const Duration(seconds: 15), (_) {
            _sendBreadcrumbPing(roundId: roundId, isFinalStop: false);
          });
        }
      }
    } catch (e) {
      debugPrint('Failed to start live session: $e');
    }
  }

  // Sends live GPS coordinate to Cloudflare Worker
  Future<void> _sendBreadcrumbPing({
    required String roundId,
    required bool isFinalStop,
  }) async {
    if (_activeSessionId == null) return;

    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      await http.post(
        Uri.parse(ApiConfig.sessionPingUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
        body: jsonEncode({
          'session_id': _activeSessionId,
          'round_id': roundId,
          'lat': pos.latitude,
          'lng': pos.longitude,
          'is_final_stop': isFinalStop,
        }),
      );

      if (!mounted) return;
      if (isFinalStop) {
        _breadcrumbTimer?.cancel();
        setState(() {
          _isLiveTracking = false;
          _activeSessionId = null;
          _activeTrackingRoundId = null;
        });
      } else {
        setState(() {
          _pingCount += 1;
          _lastPingTime = TimeOfDay.now().format(context);
        });
      }
    } catch (e) {
      debugPrint('Breadcrumb ping error: $e');
    }
  }

  Future<void> _handleScanCheckpoint({
    required dynamic checkpoint,
    required int stopIndex,
    required List<dynamic> currentCheckpoints,
    required String roundId,
    required String routeName,
  }) async {
    final String checkpointId = checkpoint['checkpoint_id']?.toString() ?? '';
    final String qrPayload = checkpoint['qr_payload']?.toString() ?? '';
    final parts = qrPayload.split('|');

    bool? scanVerified;

    if (parts.length >= 4) {
      scanVerified = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (context) => LockedCameraScreen(
            checkpointId: checkpointId,
            expectedLat: double.tryParse(parts[1]) ?? 0.0,
            expectedLng: double.tryParse(parts[2]) ?? 0.0,
            signature: parts[3],
          ),
        ),
      );
    } else {
      scanVerified = await Navigator.push<bool>(
        context,
        MaterialPageRoute(builder: (context) => const QrScannerScreen()),
      );
    }

    if (scanVerified == true) {
      setState(() {
        _verifiedCheckpointIds.add(checkpointId);
      });

      final bool isFirstStop = stopIndex == 0;
      final bool isFinalStop = stopIndex == currentCheckpoints.length - 1;

      if (currentCheckpoints.length == 1) {
        // Single-stop route: start and immediately finish session
        await _startLivePatrolSession(roundId);
        await _sendBreadcrumbPing(roundId: roundId, isFinalStop: true);
      } else if (isFirstStop) {
        // Stop #1 (Start QR): Begin 15-second live GPS breadcrumb tracking
        await _startLivePatrolSession(roundId);
      } else if (isFinalStop) {
        // Final QR: Send final coordinate and stop live tracking timer
        await _sendBreadcrumbPing(roundId: roundId, isFinalStop: true);
      } else {
        // Intermediate QR: Log immediate ping along the route
        await _sendBreadcrumbPing(roundId: roundId, isFinalStop: false);
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.green.shade700,
          content: Text(
            isFirstStop && currentCheckpoints.length > 1
                ? 'Start QR Verified! Live GPS tracking started.'
                : 'Stop verified: ${checkpoint['name']}',
          ),
        ),
      );

      final verifiedInRoute = currentCheckpoints
          .where((cp) => _verifiedCheckpointIds.contains(cp['checkpoint_id']?.toString()))
          .length;

      if (currentCheckpoints.isNotEmpty && verifiedInRoute >= currentCheckpoints.length) {
        _showRoundCompleteDialog(routeName, currentCheckpoints.length);
      }
    }
  }

  void _showRoundCompleteDialog(String routeName, int stopCount) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: Colors.green, size: 28),
            SizedBox(width: 8),
            Text('Patrol Complete', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Text(
          'All $stopCount stops for "$routeName" are verified. Live GPS tracking has been completed and saved.',
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E3A8A),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentRoute = _assignedRoutes.isNotEmpty ? _assignedRoutes[_selectedRouteIndex] : null;
    final String currentRoundId = currentRoute != null ? (currentRoute['id']?.toString() ?? '') : '';
    final String currentRouteName = currentRoute != null ? (currentRoute['name'] ?? 'Patrol Route') : _statusMessage;
    final List<dynamic> checkpoints = currentRoute != null ? (currentRoute['checkpoints'] ?? []) : [];

    final totalStops = checkpoints.length;
    final verifiedCount = checkpoints
        .where((cp) => _verifiedCheckpointIds.contains(cp['checkpoint_id']?.toString()))
        .length;
    final isRoundFinished = totalStops > 0 && verifiedCount == totalStops;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Patrol Routes', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Routes',
            onPressed: _loadSessionAndRoutes,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF1E3A8A)))
          : Column(
              children: [
                // LIVE GPS TRACKING ACTIVE BANNER
                if (_isLiveTracking)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    color: Colors.green.shade800,
                    child: Row(
                      children: [
                        const Icon(Icons.my_location, color: Colors.greenAccent, size: 18),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'LIVE TRACKING ACTIVE — Sending GPS path ($_pingCount pings • $_lastPingTime)',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                // Multi-Route Selector Tabs
                if (_assignedRoutes.length > 1)
                  Container(
                    width: double.infinity,
                    color: const Color(0xFF172554),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: List.generate(_assignedRoutes.length, (idx) {
                          final r = _assignedRoutes[idx];
                          final bool isSelected = idx == _selectedRouteIndex;
                          final List cps = r['checkpoints'] ?? [];
                          return Padding(
                            padding: const EdgeInsets.only(right: 8.0),
                            child: ChoiceChip(
                              label: Text('${r['name']} (${cps.length})'),
                              selected: isSelected,
                              onSelected: (_) => setState(() => _selectedRouteIndex = idx),
                              selectedColor: Colors.blueAccent,
                              backgroundColor: Colors.white12,
                              labelStyle: TextStyle(
                                color: Colors.white,
                                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                fontSize: 12,
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ),

                // Route Progress Header
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: const BoxDecoration(
                    color: Color(0xFF1E3A8A),
                    borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              currentRouteName,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          if (verifiedCount > 0)
                            TextButton.icon(
                              onPressed: () {
                                _breadcrumbTimer?.cancel();
                                setState(() {
                                  _isLiveTracking = false;
                                  _activeSessionId = null;
                                  for (final cp in checkpoints) {
                                    _verifiedCheckpointIds.remove(cp['checkpoint_id']?.toString());
                                  }
                                });
                              },
                              icon: const Icon(Icons.replay, size: 14, color: Colors.white70),
                              label: const Text(
                                'Reset Run',
                                style: TextStyle(color: Colors.white70, fontSize: 11),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        totalStops == 0
                            ? 'No checkpoints assigned'
                            : 'Progress: $verifiedCount of $totalStops Stops Verified',
                        style: const TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: totalStops == 0 ? 0 : (verifiedCount / totalStops),
                          minHeight: 8,
                          backgroundColor: Colors.white24,
                          valueColor: const AlwaysStoppedAnimation<Color>(Colors.greenAccent),
                        ),
                      ),
                    ],
                  ),
                ),

                // Ordered Sequence Checklist (Start QR -> Intermediate -> Final QR)
                Expanded(
                  child: checkpoints.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24.0),
                            child: Text(
                              _statusMessage,
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: checkpoints.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final cp = checkpoints[index];
                            final cpId = cp['checkpoint_id']?.toString() ?? '';
                            final bool isDone = _verifiedCheckpointIds.contains(cpId);

                            // Sequential Lock: Stop #1 is unlocked first; next stops unlock in order
                            final bool isUnlocked = index == 0 ||
                                _verifiedCheckpointIds.contains(
                                  checkpoints[index - 1]['checkpoint_id']?.toString() ?? '',
                                );

                            String roleBadge = 'STOP #${index + 1}';
                            if (index == 0) {
                              roleBadge = 'START POINT QR';
                            } else if (index == checkpoints.length - 1 && checkpoints.length > 1) {
                              roleBadge = 'FINAL FINISH QR';
                            }

                            return Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: isUnlocked || isDone ? Colors.white : Colors.grey.shade100,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: isDone
                                      ? Colors.green.shade400
                                      : isUnlocked
                                          ? Colors.blue.shade200
                                          : Colors.grey.shade300,
                                  width: isDone || isUnlocked ? 1.5 : 1,
                                ),
                              ),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 18,
                                    backgroundColor: isDone
                                        ? Colors.green.shade50
                                        : isUnlocked
                                            ? const Color(0xFF1E3A8A).withOpacity(0.1)
                                            : Colors.grey.shade200,
                                    child: isDone
                                        ? const Icon(Icons.check, color: Colors.green, size: 20)
                                        : isUnlocked
                                            ? Text(
                                                '${index + 1}',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  color: Color(0xFF1E3A8A),
                                                  fontSize: 13,
                                                ),
                                              )
                                            : const Icon(Icons.lock_outline, color: Colors.grey, size: 16),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: index == 0
                                                ? Colors.blue.shade50
                                                : index == checkpoints.length - 1
                                                    ? Colors.purple.shade50
                                                    : Colors.grey.shade100,
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Text(
                                            roleBadge,
                                            style: TextStyle(
                                              fontSize: 9,
                                              fontWeight: FontWeight.bold,
                                              color: index == 0
                                                  ? Colors.blue.shade800
                                                  : index == checkpoints.length - 1
                                                      ? Colors.purple.shade800
                                                      : Colors.grey.shade700,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          cp['name'] ?? 'Stop #${index + 1}',
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 14,
                                            color: isDone
                                                ? Colors.green.shade800
                                                : isUnlocked
                                                    ? const Color(0xFF0F172A)
                                                    : Colors.grey.shade500,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          isDone
                                              ? 'Verified (GPS & Dual Proof)'
                                              : isUnlocked
                                                  ? (index == 0
                                                      ? 'Scan to start route & live GPS tracking'
                                                      : 'Walk to checkpoint & scan QR')
                                                  : 'Locked — Verify Stop #$index first',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: isDone
                                                ? Colors.green.shade600
                                                : isUnlocked
                                                    ? Colors.blueGrey.shade600
                                                    : Colors.grey.shade400,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (!isDone)
                                    ElevatedButton.icon(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: isUnlocked
                                            ? const Color(0xFF1E3A8A)
                                            : Colors.grey.shade300,
                                        foregroundColor: Colors.white,
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                      ),
                                      onPressed: isUnlocked
                                          ? () => _handleScanCheckpoint(
                                                checkpoint: cp,
                                                stopIndex: index,
                                                currentCheckpoints: checkpoints,
                                                roundId: currentRoundId,
                                                routeName: currentRouteName,
                                              )
                                          : null,
                                      icon: Icon(
                                        isUnlocked ? Icons.qr_code_scanner : Icons.lock,
                                        size: 14,
                                      ),
                                      label: Text(
                                        index == 0 ? 'Start' : 'Verify',
                                        style: const TextStyle(fontSize: 12),
                                      ),
                                    ),
                                ],
                              ),
                            );
                          },
                        ),
                ),

                if (isRoundFinished)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(top: BorderSide(color: Color(0xFFE2E8F0))),
                    ),
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green.shade700,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () => _showRoundCompleteDialog(currentRouteName, totalStops),
                      icon: const Icon(Icons.verified, color: Colors.white),
                      label: const Text(
                        'Patrol Round Complete (All Stops Verified)',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}