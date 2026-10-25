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
  List<dynamic> _assignedRoutes = [];
  int _selectedRouteIndex = 0;
  String _statusMessage = 'No Route Assigned';
  final Set<String> _verifiedCheckpointIds = {};

  @override
  void initState() {
    super.initState();
    _loadSessionAndRoutes();
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

  Future<void> _handleScanCheckpoint(dynamic checkpoint, List<dynamic> currentCheckpoints, String routeName) async {
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

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.green.shade700,
          content: Text('Stop verified: ${checkpoint['name']}'),
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
          'All $stopCount stops for "$routeName" have been verified with GPS and dual-camera proof.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              // Reset current route session if guard wants to start a fresh run later
              Navigator.pop(ctx);
            },
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentRoute = _assignedRoutes.isNotEmpty ? _assignedRoutes[_selectedRouteIndex] : null;
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
                // Multi-Route Selector Tabs (shown when guard has multiple assigned routes)
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

                // Route Progress Banner
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
                                setState(() {
                                  for (final cp in checkpoints) {
                                    _verifiedCheckpointIds.remove(cp['checkpoint_id']?.toString());
                                  }
                                });
                              },
                              icon: const Icon(Icons.replay, size: 14, color: Colors.white70),
                              label: const Text(
                                'Start New Run',
                                style: TextStyle(color: Colors.white70, fontSize: 11),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        totalStops == 0
                            ? 'No checkpoints assigned'
                            : 'Current Run Progress: $verifiedCount of $totalStops Stops Verified',
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

                // Checklist of Route Stops
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

                            return Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: isDone ? Colors.green.shade300 : Colors.grey.shade200,
                                  width: isDone ? 1.5 : 1,
                                ),
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
                                      onPressed: () => _handleScanCheckpoint(cp, checkpoints, currentRouteName),
                                      icon: const Icon(Icons.camera_alt, size: 14),
                                      label: const Text('Verify', style: TextStyle(fontSize: 12)),
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