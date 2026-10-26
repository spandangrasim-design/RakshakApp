import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import 'locked_camera_screen.dart';

class PatrolRouteScreen extends StatefulWidget {
  const PatrolRouteScreen({super.key});

  @override
  State<PatrolRouteScreen> createState() => _PatrolRouteScreenState();
}

class _PatrolRouteScreenState extends State<PatrolRouteScreen> {
  static const double _maxAllowedDistanceMeters = 50.0;

  bool _isLoading = true;
  String _token = '';
  List<dynamic> _assignedRoutes = [];
  int _selectedRouteIndex = 0;
  String _statusMessage = 'No Route Assigned';
  final Set<String> _verifiedCheckpointIds = {};

  // Live Breadcrumb Tracking State
  Timer? _breadcrumbTimer;
  String? _activeSessionId;
  bool _isLiveTracking = false;
  int _pingCount = 0;
  String _lastPingTime = '';
  double? _lastPingLat;
  double? _lastPingLng;

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

  String _getCpId(dynamic cp) {
    return (cp['checkpoint_id'] ?? cp['id'] ?? '').toString().trim();
  }

  String _getTodayStorageKey() {
    final now = DateTime.now();
    final dateStr =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    return 'verified_checkpoints_$dateStr';
  }

  Future<void> _saveVerifiedCheckpointsToPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _getTodayStorageKey(),
      _verifiedCheckpointIds.toList(),
    );
  }

  Future<void> _loadSessionAndRoutes() async {
    setState(() => _isLoading = true);

    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('access_token') ?? prefs.getString('token') ?? '';

    // Restore today's verified stops from local storage
    final savedIds = prefs.getStringList(_getTodayStorageKey()) ?? [];
    _verifiedCheckpointIds.addAll(savedIds);

    if (_token.isEmpty) {
      if (mounted) {
        setState(() {
          _statusMessage = 'Please log in again';
          _isLoading = false;
        });
      }
      return;
    }

    await Future.wait([
      _fetchAssignedRoutes(),
      _syncTodayVerifiedScansFromServer(),
    ]);

    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  // Syncs today's completed scans from backend so unlocked stops stay unlocked
  Future<void> _syncTodayVerifiedScansFromServer() async {
    try {
      final res = await http.get(
        Uri.parse(ApiConfig.scansUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final List scans = data['scans'] ?? [];
        final now = DateTime.now();

        for (final s in scans) {
          final scanTimeStr = s['scan_time']?.toString() ?? '';
          final cpId = s['checkpoint_id']?.toString() ?? '';
          if (cpId.isEmpty || scanTimeStr.isEmpty) continue;

          final parsedTime = DateTime.tryParse(scanTimeStr)?.toLocal();
          if (parsedTime != null &&
              parsedTime.year == now.year &&
              parsedTime.month == now.month &&
              parsedTime.day == now.day) {
            _verifiedCheckpointIds.add(cpId);
          }
        }
        await _saveVerifiedCheckpointsToPrefs();
      }
    } catch (e) {
      debugPrint('Failed to sync today scans: $e');
    }
  }

  Future<bool> _didCheckpointJustUpload(String checkpointId) async {
    try {
      final res = await http.get(
        Uri.parse(ApiConfig.scansUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final List scans = data['scans'] ?? [];
        final now = DateTime.now();

        for (final s in scans) {
          final cpId = (s['checkpoint_id'] ?? '').toString().trim();
          if (cpId.toLowerCase() != checkpointId.toLowerCase()) continue;

          final scanTimeStr = s['scan_time']?.toString() ?? '';
          final parsedTime = DateTime.tryParse(scanTimeStr)?.toLocal();
          if (parsedTime != null &&
              now.difference(parsedTime).inMinutes.abs() <= 5) {
            return true;
          }
        }
      }
    } catch (_) {}
    return false;
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
          final List routes =
              data['routes'] ?? (data['route'] != null ? [data['route']] : []);
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

  Future<void> _startLivePatrolSession(
      String roundId, double startLat, double startLng) async {
    try {
      double initLat = startLat;
      double initLng = startLng;

      try {
        final pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
        );
        initLat = pos.latitude;
        initLng = pos.longitude;
      } catch (_) {}

      final res = await http.post(
        Uri.parse(ApiConfig.sessionStartUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
        body: jsonEncode({
          'round_id': roundId,
          'lat': initLat,
          'lng': initLng,
        }),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true && data['session'] != null) {
          _breadcrumbTimer?.cancel();
          setState(() {
            _activeSessionId = data['session']['id']?.toString();
            _isLiveTracking = true;
            _pingCount = 1;
            _lastPingLat = initLat;
            _lastPingLng = initLng;
            _lastPingTime = TimeOfDay.now().format(context);
          });

          _breadcrumbTimer = Timer.periodic(const Duration(seconds: 15), (_) {
            _sendBreadcrumbPing(
                roundId: roundId, isFinalStop: false, forceSend: false);
          });
        }
      }
    } catch (e) {
      debugPrint('Failed to start live session: $e');
    }
  }

  Future<void> _sendBreadcrumbPing({
    required String roundId,
    required bool isFinalStop,
    bool forceSend = false,
  }) async {
    if (_activeSessionId == null) return;

    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      if (!forceSend && !isFinalStop && pos.accuracy > 35.0) {
        return;
      }

      if (!forceSend &&
          !isFinalStop &&
          _lastPingLat != null &&
          _lastPingLng != null) {
        final movedMeters = Geolocator.distanceBetween(
          _lastPingLat!,
          _lastPingLng!,
          pos.latitude,
          pos.longitude,
        );
        if (movedMeters < 8.0) {
          return;
        }
      }

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
        });
      } else {
        setState(() {
          _pingCount += 1;
          _lastPingLat = pos.latitude;
          _lastPingLng = pos.longitude;
          _lastPingTime = TimeOfDay.now().format(context);
        });
      }
    } catch (e) {
      debugPrint('Breadcrumb ping error: $e');
    }
  }

  Future<bool> _verifyProximityOrWarn({
    required String checkpointName,
    required double expectedLat,
    required double expectedLng,
  }) async {
    if (expectedLat == 0.0 && expectedLng == 0.0) return true;

    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      ).timeout(const Duration(seconds: 8));

      final distanceMeters = Geolocator.distanceBetween(
        pos.latitude,
        pos.longitude,
        expectedLat,
        expectedLng,
      );

      if (distanceMeters <= _maxAllowedDistanceMeters) {
        return true;
      }

      if (!mounted) return false;

      final bool? proceedAnyway = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Icon(Icons.warning_amber_rounded,
                  color: Colors.orange.shade800, size: 28),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Far From QR Location!',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: Text(
                  'You are ${distanceMeters.round()} meters away from "$checkpointName" (Allowed range: ${_maxAllowedDistanceMeters.round()}m).',
                  style: TextStyle(
                    color: Colors.red.shade900,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '• Expected QR GPS: ${expectedLat.toStringAsFixed(5)}, ${expectedLng.toStringAsFixed(5)}',
                style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
              ),
              const SizedBox(height: 4),
              Text(
                '• Your Current GPS: ${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}',
                style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
              ),
              const SizedBox(height: 12),
              const Text(
                'If you continue, your actual capture location will be logged and flagged on the Admin Report Map.',
                style: TextStyle(fontSize: 12, color: Colors.black87),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel & Move Closer'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange.shade800,
                foregroundColor: Colors.white,
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Proceed Anyway (Flagged)'),
            ),
          ],
        ),
      );

      return proceedAnyway == true;
    } catch (e) {
      debugPrint('Proximity check error: $e');
      return true;
    }
  }

  Future<void> _handleScanCheckpoint({
    required dynamic checkpoint,
    required int stopIndex,
    required List<dynamic> currentCheckpoints,
    required String roundId,
    required String routeName,
  }) async {
    final String expectedCheckpointId = _getCpId(checkpoint);
    final String checkpointName =
        checkpoint['name']?.toString() ?? 'Stop #${stopIndex + 1}';
    final String storedQrPayload = checkpoint['qr_payload']?.toString() ?? '';

    // STEP 1: Open Physical QR Code Scanner FIRST
    final bool? qrMatched = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (context) => _RouteCheckpointQrScanner(
          checkpointName: checkpointName,
          stopNumber: stopIndex + 1,
          expectedCheckpointId: expectedCheckpointId,
          storedQrPayload: storedQrPayload,
          allRouteCheckpoints: currentCheckpoints,
        ),
      ),
    );

    if (qrMatched != true) {
      return;
    }

    final parts = storedQrPayload.split('|');
    final double expectedLat = parts.length >= 2
        ? (double.tryParse(parts[1]) ??
            double.tryParse(checkpoint['lat']?.toString() ?? '') ??
            0.0)
        : (double.tryParse(checkpoint['lat']?.toString() ?? '') ?? 0.0);
    final double expectedLng = parts.length >= 3
        ? (double.tryParse(parts[2]) ??
            double.tryParse(checkpoint['lng']?.toString() ?? '') ??
            0.0)
        : (double.tryParse(checkpoint['lng']?.toString() ?? '') ?? 0.0);
    final String signature = parts.length >= 4 ? parts[3].trim() : '';

    if (!mounted) return;

    // STEP 2: Check GPS Distance & Warn Guard if Far Away (> 50m) Before Selfie
    final bool canProceed = await _verifyProximityOrWarn(
      checkpointName: checkpointName,
      expectedLat: expectedLat,
      expectedLng: expectedLng,
    );

    if (!canProceed || !mounted) {
      return;
    }

    final int previousVerifiedCount = _verifiedCheckpointIds.length;

    // STEP 3: Launch LockedCameraScreen (Step 1/2 Selfie -> Step 2/2 Rear Photo)
    final bool? cameraResult = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (context) => LockedCameraScreen(
          checkpointId: expectedCheckpointId,
          expectedLat: expectedLat,
          expectedLng: expectedLng,
          signature: signature,
        ),
      ),
    );

    // Auto-sync scans from server immediately upon camera completion
    await _syncTodayVerifiedScansFromServer();

    final bool scanVerified = cameraResult == true ||
        _verifiedCheckpointIds.contains(expectedCheckpointId) ||
        _verifiedCheckpointIds.length > previousVerifiedCount ||
        await _didCheckpointJustUpload(expectedCheckpointId);

    if (scanVerified) {
      setState(() {
        _verifiedCheckpointIds.add(expectedCheckpointId);
      });
      await _saveVerifiedCheckpointsToPrefs();

      final bool isFirstStop = stopIndex == 0;
      final bool isFinalStop = stopIndex == currentCheckpoints.length - 1;

      if (currentCheckpoints.length == 1) {
        await _startLivePatrolSession(roundId, expectedLat, expectedLng);
        await _sendBreadcrumbPing(
          roundId: roundId,
          isFinalStop: true,
          forceSend: true,
        );
      } else if (isFirstStop) {
        await _startLivePatrolSession(roundId, expectedLat, expectedLng);
      } else if (isFinalStop) {
        await _sendBreadcrumbPing(
          roundId: roundId,
          isFinalStop: true,
          forceSend: true,
        );
      } else {
        await _sendBreadcrumbPing(
          roundId: roundId,
          isFinalStop: false,
          forceSend: true,
        );
      }

      if (!mounted) return;

      // Force UI rebuild so Stop #(stopIndex + 2) unlocks automatically
      setState(() {});

      final verifiedInRoute = currentCheckpoints
          .where((cp) => _verifiedCheckpointIds.contains(_getCpId(cp)))
          .length;

      if (currentCheckpoints.isNotEmpty &&
          verifiedInRoute >= currentCheckpoints.length) {
        _showRoundCompleteDialog(routeName, currentCheckpoints.length);
      } else if (stopIndex + 1 < currentCheckpoints.length) {
        final nextCp = currentCheckpoints[stopIndex + 1];
        final nextName = nextCp['name']?.toString() ?? 'Stop #${stopIndex + 2}';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 4),
            backgroundColor: Colors.green.shade800,
            content: Text(
              'Stop #${stopIndex + 1} Done! Next unlocked: Stop #${stopIndex + 2} ($nextName)',
            ),
            action: SnackBarAction(
              label: 'SCAN NEXT',
              textColor: Colors.yellowAccent,
              onPressed: () {
                _handleScanCheckpoint(
                  checkpoint: nextCp,
                  stopIndex: stopIndex + 1,
                  currentCheckpoints: currentCheckpoints,
                  roundId: roundId,
                  routeName: routeName,
                );
              },
            ),
          ),
        );
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
            Text('Patrol Complete',
                style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Text(
          'All $stopCount QR stops for "$routeName" have been scanned and verified.',
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
    final currentRoute = _assignedRoutes.isNotEmpty
        ? _assignedRoutes[_selectedRouteIndex]
        : null;
    final String currentRoundId =
        currentRoute != null ? (currentRoute['id']?.toString() ?? '') : '';
    final String currentRouteName = currentRoute != null
        ? (currentRoute['name'] ?? 'Patrol Route')
        : _statusMessage;
    final List<dynamic> checkpoints =
        currentRoute != null ? (currentRoute['checkpoints'] ?? []) : [];

    final totalStops = checkpoints.length;
    final verifiedCount = checkpoints
        .where((cp) => _verifiedCheckpointIds.contains(_getCpId(cp)))
        .length;
    final isRoundFinished = totalStops > 0 && verifiedCount == totalStops;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Patrol Routes',
            style: TextStyle(fontWeight: FontWeight.bold)),
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
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF1E3A8A)))
          : Column(
              children: [
                if (_isLiveTracking)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    color: Colors.green.shade800,
                    child: Row(
                      children: [
                        const Icon(Icons.my_location,
                            color: Colors.greenAccent, size: 18),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'LIVE TRACKING ACTIVE — Sending GPS path ($_pingCount pts • $_lastPingTime)',
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

                if (_assignedRoutes.length > 1)
                  Container(
                    width: double.infinity,
                    color: const Color(0xFF0F172A),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 12),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children:
                            List.generate(_assignedRoutes.length, (idx) {
                          final r = _assignedRoutes[idx];
                          final bool isSelected = idx == _selectedRouteIndex;
                          final List cps = r['checkpoints'] ?? [];
                          final String rName =
                              r['name']?.toString() ?? 'Route ${idx + 1}';

                          return Padding(
                            padding: const EdgeInsets.only(right: 10.0),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(10),
                              onTap: () =>
                                  setState(() => _selectedRouteIndex = idx),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 180),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 9),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? const Color(0xFF2563EB)
                                      : const Color(0xFF1E293B),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isSelected
                                        ? Colors.white
                                        : const Color(0xFF475569),
                                    width: isSelected ? 1.5 : 1,
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      isSelected
                                          ? Icons.route
                                          : Icons.location_on_outlined,
                                      size: 15,
                                      color: isSelected
                                          ? Colors.white
                                          : const Color(0xFF94A3B8),
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      '$rName (${cps.length})',
                                      style: TextStyle(
                                        color: isSelected
                                            ? Colors.white
                                            : const Color(0xFFE2E8F0),
                                        fontWeight: isSelected
                                            ? FontWeight.bold
                                            : FontWeight.w500,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ),

                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: const BoxDecoration(
                    color: Color(0xFF1E3A8A),
                    borderRadius:
                        BorderRadius.vertical(bottom: Radius.circular(24)),
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
                              onPressed: () async {
                                _breadcrumbTimer?.cancel();
                                setState(() {
                                  _isLiveTracking = false;
                                  _activeSessionId = null;
                                  for (final cp in checkpoints) {
                                    _verifiedCheckpointIds.remove(_getCpId(cp));
                                  }
                                });
                                await _saveVerifiedCheckpointsToPrefs();
                              },
                              icon: const Icon(Icons.replay,
                                  size: 14, color: Colors.white70),
                              label: const Text(
                                'Reset Run',
                                style: TextStyle(
                                    color: Colors.white70, fontSize: 11),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        totalStops == 0
                            ? 'No checkpoints assigned'
                            : 'Progress: $verifiedCount of $totalStops QR Stops Captured',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 13),
                      ),
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value:
                              totalStops == 0 ? 0 : (verifiedCount / totalStops),
                          minHeight: 8,
                          backgroundColor: Colors.white24,
                          valueColor: const AlwaysStoppedAnimation<Color>(
                              Colors.greenAccent),
                        ),
                      ),
                    ],
                  ),
                ),

                Expanded(
                  child: checkpoints.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24.0),
                            child: Text(
                              _statusMessage,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  fontSize: 14, color: Colors.grey.shade600),
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: checkpoints.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final cp = checkpoints[index];
                            final cpId = _getCpId(cp);
                            final bool isDone =
                                _verifiedCheckpointIds.contains(cpId);

                            final bool isUnlocked = index == 0 ||
                                _verifiedCheckpointIds
                                    .contains(_getCpId(checkpoints[index - 1]));

                            String roleBadge = 'STOP #${index + 1}';
                            if (index == 0) {
                              roleBadge = 'START POINT QR';
                            } else if (index == checkpoints.length - 1 &&
                                checkpoints.length > 1) {
                              roleBadge = 'FINAL FINISH QR';
                            }

                            return Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: isUnlocked || isDone
                                    ? Colors.white
                                    : Colors.grey.shade100,
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
                                            ? const Color(0xFF1E3A8A)
                                                .withOpacity(0.1)
                                            : Colors.grey.shade200,
                                    child: isDone
                                        ? const Icon(Icons.check,
                                            color: Colors.green, size: 20)
                                        : isUnlocked
                                            ? Text(
                                                '${index + 1}',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  color: Color(0xFF1E3A8A),
                                                  fontSize: 13,
                                                ),
                                              )
                                            : const Icon(Icons.lock_outline,
                                                color: Colors.grey, size: 16),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: isDone
                                                ? Colors.green.shade50
                                                : index == 0
                                                    ? Colors.blue.shade50
                                                    : index ==
                                                            checkpoints.length -
                                                                1
                                                        ? Colors.purple.shade50
                                                        : Colors.grey.shade100,
                                            borderRadius:
                                                BorderRadius.circular(4),
                                          ),
                                          child: Text(
                                            isDone
                                                ? 'QR CAPTURED ✓'
                                                : roleBadge,
                                            style: TextStyle(
                                              fontSize: 9,
                                              fontWeight: FontWeight.bold,
                                              color: isDone
                                                  ? Colors.green.shade800
                                                  : index == 0
                                                      ? Colors.blue.shade800
                                                      : index ==
                                                              checkpoints
                                                                      .length -
                                                                  1
                                                          ? Colors
                                                              .purple.shade800
                                                          : Colors
                                                              .grey.shade700,
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
                                              ? 'QR Scanned + Dual Photos Verified'
                                              : isUnlocked
                                                  ? 'Step 1: Scan QR -> Step 2: GPS Check & Selfie'
                                                  : 'Locked — Complete Stop #$index first',
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
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 12, vertical: 8),
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(8),
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
                                        isUnlocked
                                            ? Icons.qr_code_scanner
                                            : Icons.lock,
                                        size: 14,
                                      ),
                                      label: const Text(
                                        'Scan QR',
                                        style: TextStyle(fontSize: 12),
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
                      border:
                          Border(top: BorderSide(color: Color(0xFFE2E8F0))),
                    ),
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green.shade700,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () =>
                          _showRoundCompleteDialog(currentRouteName, totalStops),
                      icon: const Icon(Icons.verified, color: Colors.white),
                      label: const Text(
                        'Patrol Round Complete (All Stops Verified)',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _RouteCheckpointQrScanner extends StatefulWidget {
  final String checkpointName;
  final int stopNumber;
  final String expectedCheckpointId;
  final String storedQrPayload;
  final List<dynamic> allRouteCheckpoints;

  const _RouteCheckpointQrScanner({
    required this.checkpointName,
    required this.stopNumber,
    required this.expectedCheckpointId,
    required this.storedQrPayload,
    required this.allRouteCheckpoints,
  });

  @override
  State<_RouteCheckpointQrScanner> createState() =>
      _RouteCheckpointQrScannerState();
}

class _RouteCheckpointQrScannerState extends State<_RouteCheckpointQrScanner> {
  final MobileScannerController _controller = MobileScannerController();
  bool _hasPopped = false;
  String? _errorText;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_hasPopped) return;

    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue?.trim();
      if (raw == null || raw.isEmpty) continue;

      final rawLower = raw.toLowerCase();
      final expectedIdLower = widget.expectedCheckpointId.trim().toLowerCase();
      final expectedNameLower = widget.checkpointName.trim().toLowerCase();

      final bool matchesExpected =
          (expectedIdLower.isNotEmpty && rawLower.contains(expectedIdLower)) ||
              (widget.storedQrPayload.isNotEmpty &&
                  rawLower == widget.storedQrPayload.trim().toLowerCase()) ||
              rawLower == expectedNameLower;

      if (matchesExpected) {
        _hasPopped = true;
        Navigator.pop(context, true);
        return;
      }

      String? otherMatchedStop;
      for (int i = 0; i < widget.allRouteCheckpoints.length; i++) {
        final cp = widget.allRouteCheckpoints[i];
        final otherId = ((cp['checkpoint_id'] ?? cp['id'])?.toString() ?? '')
            .trim()
            .toLowerCase();
        if (otherId.isNotEmpty && rawLower.contains(otherId)) {
          otherMatchedStop = 'Stop #${i + 1} (${cp['name']})';
          break;
        }
      }

      if (otherMatchedStop != null) {
        setState(() {
          _errorText =
              'Wrong Checkpoint! You scanned $otherMatchedStop.\nPlease scan Stop #${widget.stopNumber} (${widget.checkpointName}).';
        });
        continue;
      }

      try {
        if (raw.startsWith('{') && raw.endsWith('}')) {
          final Map<String, dynamic> decoded = jsonDecode(raw);
          final String jsonId =
              (decoded['checkpoint_id'] ?? decoded['id'] ?? '')
                  .toString()
                  .toLowerCase();
          final String jsonName =
              (decoded['name'] ?? '').toString().toLowerCase();
          if ((expectedIdLower.isNotEmpty && jsonId == expectedIdLower) ||
              (expectedNameLower.isNotEmpty && jsonName == expectedNameLower)) {
            _hasPopped = true;
            Navigator.pop(context, true);
            return;
          }
        }
      } catch (_) {}

      setState(() {
        _errorText =
            'QR mismatch! Please scan the QR code for Stop #${widget.stopNumber} (${widget.checkpointName}).';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          'Scan Stop #${widget.stopNumber}: ${widget.checkpointName}',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
        ),
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
          ),
          Center(
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.greenAccent, width: 3),
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
          Positioned(
            bottom: 36,
            left: 20,
            right: 20,
            child: Column(
              children: [
                if (_errorText != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade800,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _errorText!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.black87,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    'Point camera at the QR Code for "${widget.checkpointName}".\nAfter scanning, GPS distance will be checked before Selfie.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}