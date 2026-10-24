import 'dart:convert';
import 'package:flutter/material.dart';
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
  String _routeName = 'Assigned Patrol Route';
  List<dynamic> _checkpoints = [];
  final Set<String> _verifiedCheckpointIds = {};

  @override
  void initState() {
    super.initState();
    _loadSessionAndRoute();
  }

  Future<void> _loadSessionAndRoute() async {
    setState(() => _isLoading = true);

    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('access_token') ?? prefs.getString('token') ?? '';

    if (_token.isEmpty) {
      if (mounted) {
        setState(() {
          _routeName = 'Please log in again';
          _isLoading = false;
        });
      }
      return;
    }

    await _fetchAssignedRoute();
    await _fetchRecentScans();

    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  // 1. Fetch the route assigned to this guard from Cloudflare Worker
  Future<void> _fetchAssignedRoute() async {
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
          final route = data['route'];
          _routeName = route['name'] ?? 'Assigned Patrol';
          _checkpoints = route['checkpoints'] ?? [];
        } else {
          _routeName = data['message'] ?? 'No Route Assigned (Free Roam)';
          _checkpoints = [];
        }
      }
    } catch (e) {
      debugPrint('Error fetching assigned route: $e');
    }
  }

  // 2. Fetch today's scans so verified stops stay green across app restarts
  Future<void> _fetchRecentScans() async {
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
        if (data['success'] == true && data['scans'] is List) {
          final List scans = data['scans'];
          for (final s in scans) {
            final cpId = s['checkpoint_id'];
            if (cpId != null) {
              _verifiedCheckpointIds.add(cpId.toString());
            }
          }
        }
      }
    } catch (_) {}
  }

  // 3. Trigger scanning for a specific checkpoint stop
  Future<void> _handleScanCheckpoint(dynamic checkpoint) async {
    final String checkpointId = checkpoint['checkpoint_id']?.toString() ?? '';
    final String qrPayload = checkpoint['qr_payload']?.toString() ?? '';
    final parts = qrPayload.split('|');

    bool? scanVerified;

    if (parts.length >= 4) {
      // Direct jump into your 2-step camera (Front selfie + Rear checkpoint proof)
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
      // Fallback: Open your QR Scanner screen
      scanVerified = await Navigator.push<bool>(
        context,
        MaterialPageRoute(builder: (context) => const QrScannerScreen()),
      );
    }

    if (scanVerified == true) {
      setState(() {
        _verifiedCheckpointIds.add(checkpointId);
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.green.shade700,
          content: Text('Stop verified: ${checkpoint['name']}'),
        ),
      );

      // Check if all stops in the route are now complete
      if (_checkpoints.isNotEmpty &&
          _verifiedCheckpointIds.length >= _checkpoints.length) {
        _showRoundCompleteDialog();
      }
    }
  }

  void _showRoundCompleteDialog() {
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
          'All ${_checkpoints.length} stops for "$_routeName" have been verified with GPS and dual-camera proof.',
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E3A8A),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              Navigator.pop(ctx);
            },
            child: const Text('OK', style: TextStyle(color: Colors.white)),
          )
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final totalStops = _checkpoints.length;
    final verifiedCount = _checkpoints
        .where((cp) => _verifiedCheckpointIds.contains(cp['checkpoint_id']?.toString()))
        .length;
    final isRoundFinished = totalStops > 0 && verifiedCount == totalStops;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Patrol Stops', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Route',
            onPressed: _loadSessionAndRoute,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF1E3A8A)))
          : Column(
              children: [
                // 1. Progress Banner
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
                      Text(
                        _routeName,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 6),
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

                // 2. Checklist of Route Stops
                Expanded(
                  child: _checkpoints.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24.0),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.route_outlined, size: 48, color: Colors.grey.shade400),
                                const SizedBox(height: 12),
                                Text(
                                  _routeName,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                const Text(
                                  'Ask your shift supervisor to assign a patrol route from the admin dashboard.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(fontSize: 12, color: Colors.grey),
                                ),
                              ],
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: _checkpoints.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final cp = _checkpoints[index];
                            final cpId = cp['checkpoint_id']?.toString() ?? '';
                            final bool isDone = _verifiedCheckpointIds.contains(cpId);

                            return Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: isDone ? Colors.green.shade300 : Colors.grey.shade200,
                                  width: isDone ? 1.5 : 1,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.02),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 16,
                                    backgroundColor: isDone
                                        ? Colors.green.shade50
                                        : const Color(0xFF1E3A8A).withOpacity(0.08),
                                    child: isDone
                                        ? const Icon(Icons.check, color: Colors.green, size: 18)
                                        : Text(
                                            '${index + 1}',
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: Color(0xFF1E3A8A),
                                              fontSize: 12,
                                            ),
                                          ),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          cp['name'] ?? 'Stop #${index + 1}',
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 14,
                                            color: isDone ? Colors.green.shade800 : const Color(0xFF0F172A),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          isDone ? 'Verified (GPS & Dual Proof)' : 'Pending Scan',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: isDone ? Colors.green.shade600 : Colors.grey.shade500,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (!isDone)
                                    ElevatedButton.icon(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: const Color(0xFF1E3A8A),
                                        foregroundColor: Colors.white,
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                      ),
                                      onPressed: () => _handleScanCheckpoint(cp),
                                      icon: const Icon(Icons.camera_alt, size: 14),
                                      label: const Text('Verify', style: TextStyle(fontSize: 12)),
                                    ),
                                ],
                              ),
                            );
                          },
                        ),
                ),

                // 3. Completion Banner (Appears when all stops are scanned)
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
                      onPressed: _showRoundCompleteDialog,
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