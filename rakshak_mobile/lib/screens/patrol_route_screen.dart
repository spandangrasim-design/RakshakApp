import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import 'qr_scanner_screen.dart';

class PatrolRouteScreen extends StatefulWidget {
  const PatrolRouteScreen({super.key});

  @override
  State<PatrolRouteScreen> createState() => _PatrolRouteScreenState();
}

class _PatrolRouteScreenState extends State<PatrolRouteScreen> {
  List<dynamic> _rounds = [];
  bool _isLoading = true;
  String? _errorMessage;
  bool _isOpeningScanner = false;

  @override
  void initState() {
    super.initState();
    _fetchRoutes();
  }

  Future<void> _fetchRoutes() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('access_token') ?? prefs.getString('token') ?? '';

      final response = await http.get(
        Uri.parse(ApiConfig.roundsUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 12));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true) {
          setState(() {
            _rounds = data['rounds'] ?? [];
            _isLoading = false;
          });
          return;
        }
      }

      setState(() {
        _errorMessage = 'Failed to load routes from server.';
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Network error: Check your connection and try again.';
        _isLoading = false;
      });
    }
  }

  Future<void> _openScanner() async {
    if (_isOpeningScanner) return;
    setState(() => _isOpeningScanner = true);

    try {
      await Navigator.push<Object?>(
        context,
        MaterialPageRoute(builder: (context) => const QrScannerScreen()),
      );
    } finally {
      if (mounted) setState(() => _isOpeningScanner = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Patrol Routes', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Routes',
            onPressed: _fetchRoutes,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF1E3A8A)),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.wifi_off_rounded, size: 56, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF475569), fontSize: 14),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _fetchRoutes,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1E3A8A),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_rounds.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.map_outlined, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            const Text(
              'No patrol routes assigned yet.',
              style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF334155), fontSize: 16),
            ),
            const SizedBox(height: 4),
            Text(
              'Check back once an admin assigns checkpoints.',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchRoutes,
      color: const Color(0xFF1E3A8A),
      child: ListView.builder(
        padding: const EdgeInsets.all(16.0),
        itemCount: _rounds.length,
        itemBuilder: (context, index) {
          final round = _rounds[index];
          final checkpoints = (round['checkpoints'] as List<dynamic>?) ?? [];
          return _buildRoundCard(round, checkpoints);
        },
      ),
    );
  }

  Widget _buildRoundCard(Map<String, dynamic> round, List<dynamic> checkpoints) {
    final String roundName = round['name'] ?? 'Unnamed Route';

    return Container(
      margin: const EdgeInsets.only(bottom: 16.0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: true,
          tilePadding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
          leading: CircleAvatar(
            backgroundColor: const Color(0xFF0D9488).withValues(alpha: 0.12),
            child: const Icon(Icons.route, color: Color(0xFF0D9488), size: 22),
          ),
          title: Text(
            roundName,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF0F172A)),
          ),
          subtitle: Text(
            '${checkpoints.length} Checkpoint${checkpoints.length == 1 ? '' : 's'} assigned',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
          ),
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: checkpoints.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8.0),
                      child: Text(
                        'No checkpoints assigned to this route.',
                        style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
                      ),
                    )
                  : ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: checkpoints.length,
                      separatorBuilder: (_, __) => Padding(
                        padding: const EdgeInsets.only(left: 19.0),
                        child: Container(
                          height: 16,
                          width: 2,
                          color: const Color(0xFFCBD5E1),
                        ),
                      ),
                      itemBuilder: (context, cpIndex) {
                        final cp = checkpoints[cpIndex];
                        return _buildCheckpointItem(cp, cpIndex + 1);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCheckpointItem(Map<String, dynamic> cp, int sequenceNumber) {
    final String name = cp['name'] ?? 'Unnamed Checkpoint';
    final String lat = cp['lat']?.toString() ?? '0.0';
    final String lng = cp['lng']?.toString() ?? '0.0';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: const Color(0xFF1E3A8A),
            child: Text(
              '$sequenceNumber',
              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF1E293B)),
                ),
                const SizedBox(height: 2),
                Text(
                  'GPS: $lat, $lng',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontFamily: 'monospace'),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.qr_code_scanner, color: Color(0xFF2563EB), size: 20),
            tooltip: 'Scan this checkpoint',
            onPressed: _isOpeningScanner ? null : _openScanner,
          ),
        ],
      ),
    );
  }
}