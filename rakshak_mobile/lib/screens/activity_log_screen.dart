import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../services/token_store.dart';

import '../config/api_config.dart';
import '../services/local_db_service.dart';
import '../services/sync_service.dart';

class ActivityLogScreen extends StatefulWidget {
  const ActivityLogScreen({super.key});

  @override
  State<ActivityLogScreen> createState() => _ActivityLogScreenState();
}

class _ActivityLogScreenState extends State<ActivityLogScreen> {
  List<Map<String, dynamic>> _pendingScans = [];
  List<dynamic> _syncedScans = [];
  bool _isLoading = true;
  bool _isSyncing = false;

  @override
  void initState() {
    super.initState();
    _loadAllLogs();
  }

  Future<void> _loadAllLogs() async {
    setState(() => _isLoading = true);

    // 1. Fetch pending offline scans from SQLite
    final offline = await LocalDbService().getUnsyncedScans();

    // 2. Fetch synced scans from Cloudflare API
    List<dynamic> online = [];
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = await TokenStore.read();

      final response = await http.get(
        Uri.parse(ApiConfig.scansUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true) {
          online = data['scans'] ?? [];
        }
      }
    } catch (_) {
      // Offline or network timeout; display offline scans
    }

    if (mounted) {
      setState(() {
        _pendingScans = offline;
        _syncedScans = online;
        _isLoading = false;
      });
    }
  }

  Future<void> _triggerManualSync() async {
    setState(() => _isSyncing = true);

    // Actually wait for the upload to finish (no guessing with a delay)
    await SyncService().syncNow();
    await _loadAllLogs();

    if (mounted) {
      setState(() => _isSyncing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sync cycle complete.'),
          backgroundColor: Color(0xFF1E3A8A),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Activity Log', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: _isSyncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            tooltip: 'Sync Offline Scans',
            onPressed: _isSyncing ? null : _triggerManualSync,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF1E3A8A)))
          : RefreshIndicator(
              onRefresh: _loadAllLogs,
              color: const Color(0xFF1E3A8A),
              child: ListView(
                padding: const EdgeInsets.all(16.0),
                children: [
                  _buildSummaryCards(),
                  const SizedBox(height: 20),

                  // Section 1: Pending Offline Scans
                  if (_pendingScans.isNotEmpty) ...[
                    Row(
                      children: [
                        const Icon(Icons.cloud_off, size: 18, color: Color(0xFFD97706)),
                        const SizedBox(width: 8),
                        Text(
                          'Pending Sync (${_pendingScans.length})',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF0F172A)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ..._pendingScans.map((scan) => _buildPendingScanCard(scan)),
                    const SizedBox(height: 20),
                  ],

                  // Section 2: Synced History
                  Row(
                    children: [
                      const Icon(Icons.cloud_done, size: 18, color: Color(0xFF059669)),
                      const SizedBox(width: 8),
                      Text(
                        'Synced History (${_syncedScans.length})',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF0F172A)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  if (_syncedScans.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(24),
                      alignment: Alignment.center,
                      child: Text(
                        _pendingScans.isEmpty ? 'No scan activity recorded yet.' : 'No synced logs available while offline.',
                        style: TextStyle(color: Colors.grey.shade500, fontSize: 13),
                      ),
                    )
                  else
                    ..._syncedScans.map((scan) => _buildSyncedScanCard(scan)),
                ],
              ),
            ),
    );
  }

  Widget _buildSummaryCards() {
    return Row(
      children: [
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Pending Sync', style: TextStyle(color: Colors.black54, fontSize: 12)),
                const SizedBox(height: 4),
                Text(
                  '${_pendingScans.length}',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: _pendingScans.isNotEmpty ? const Color(0xFFD97706) : const Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Verified Scans', style: TextStyle(color: Colors.black54, fontSize: 12)),
                const SizedBox(height: 4),
                Text(
                  '${_syncedScans.length}',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF059669)),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPendingScanCard(Map<String, dynamic> scan) {
    final checkpointId = scan['checkpoint_id']?.toString() ?? 'Unknown Checkpoint';
    final lat = scan['guard_lat']?.toString() ?? '0.0';
    final lng = scan['guard_lng']?.toString() ?? '0.0';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 18,
            backgroundColor: Color(0xFFFEF3C7),
            child: Icon(Icons.hourglass_top_rounded, color: Color(0xFFD97706), size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  checkpointId.length > 18 ? '${checkpointId.substring(0, 18)}...' : checkpointId,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF78350F)),
                ),
                const SizedBox(height: 2),
                Text(
                  'GPS: $lat, $lng',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF92400E), fontFamily: 'monospace'),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFFDE68A),
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Text(
              'Queued',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF92400E)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSyncedScanCard(dynamic scan) {
    final checkpointId = scan['checkpoint_id']?.toString() ?? 'Checkpoint Verified';
    final rawTime = scan['scanned_at'] ?? scan['created_at'];
    final timeStr = rawTime != null ? DateTime.tryParse(rawTime)?.toLocal().toString().substring(0, 16) ?? '' : '';
    final isFlagged = scan['is_flagged'] == true;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: isFlagged ? const Color(0xFFFEF2F2) : const Color(0xFFECFDF5),
            child: Icon(
              isFlagged ? Icons.warning_amber_rounded : Icons.check_circle_outline,
              color: isFlagged ? const Color(0xFFDC2626) : const Color(0xFF059669),
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  checkpointId.length > 20 ? '${checkpointId.substring(0, 20)}...' : checkpointId,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF0F172A)),
                ),
                if (timeStr.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(timeStr, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                ],
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: isFlagged ? const Color(0xFFFEE2E2) : const Color(0xFFDCFCE7),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              isFlagged ? 'Flagged' : 'Verified',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: isFlagged ? const Color(0xFFB91C1C) : const Color(0xFF15803D),
              ),
            ),
          ),
        ],
      ),
    );
  }
}