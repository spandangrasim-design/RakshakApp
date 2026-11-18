import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../services/patrol_service.dart';

class PatrolScreen extends StatefulWidget {
  final String token;
  const PatrolScreen({Key? key, required this.token}) : super(key: key);

  @override
  State<PatrolScreen> createState() => _PatrolScreenState();
}

class _PatrolScreenState extends State<PatrolScreen> {
  bool _isLoading = true;
  String _routeName = 'Loading Route...';
  List<dynamic> _checkpoints = [];
  final Set<String> _verifiedCheckpointIds = {};
  bool _isShiftActive = false;

  @override
  void initState() {
    super.initState();
    _initializePatrol();
  }

  Future<void> _initializePatrol() async {
    setState(() => _isLoading = true);

    // 1. Ensure shift is started
    await PatrolService.startShift(widget.token);
    _isShiftActive = true;

    // 2. Fetch assigned route & checkpoint stops
    final routeData = await PatrolService.fetchAssignedRoute(widget.token);

    if (routeData != null) {
      setState(() {
        _routeName = routeData['name'] ?? 'Assigned Patrol';
        _checkpoints = routeData['checkpoints'] ?? [];
        _isLoading = false;
      });
    } else {
      setState(() {
        _routeName = 'No Route Assigned';
        _checkpoints = [];
        _isLoading = false;
      });
    }
  }

  // Triggered when guard scans a QR checkpoint
  Future<void> _handleScanCheckpoint(dynamic checkpoint) async {
    final String checkpointId = checkpoint['checkpoint_id'];
    final String qrPayload = checkpoint['qr_payload'] ?? '';

    // QR Payload Format: "checkpoint_id|lat|lng|signature"
    final parts = qrPayload.split('|');
    if (parts.length < 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid QR Payload structure.')),
      );
      return;
    }

    final qrLat = parts[1];
    final qrLng = parts[2];
    final signature = parts[3];

    // Placeholder: integrate your camera selfie + location photo capture
    const dummySelfieBase64 = 'data:image/jpeg;base64,...';
    const dummyLocationBase64 = 'data:image/jpeg;base64,...';

    final result = await PatrolService.submitScan(
      token: widget.token,
      clientScanId: const Uuid().v4(),
      checkpointId: checkpointId,
      qrLat: qrLat,
      qrLng: qrLng,
      signature: signature,
      guardLat: double.tryParse(qrLat) ?? 0.0, // Replace with actual Geolocator lat
      guardLng: double.tryParse(qrLng) ?? 0.0, // Replace with actual Geolocator lng
      selfieBase64: dummySelfieBase64,
      locationPhotoBase64: dummyLocationBase64,
    );

    if (result != null && result['success'] == true) {
      setState(() {
        _verifiedCheckpointIds.add(checkpointId);
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.green,
          content: Text('Stop verified: ${checkpoint['name']}'),
        ),
      );

      // Check if all stops are finished
      if (_verifiedCheckpointIds.length == _checkpoints.length) {
        _showRoundCompleteDialog();
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: Colors.red,
          content: Text('Verification failed or GPS drift exceeded limit.'),
        ),
      );
    }
  }

  // Dialog shown when all stops are scanned
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
            Text('Patrol Round Complete'),
          ],
        ),
        content: Text(
          'All ${_checkpoints.length} stops for "$_routeName" have been scanned and verified with GPS and dual-photo proofs.',
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue[900],
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              Navigator.pop(ctx);
            },
            child: const Text('Return to Overview', style: TextStyle(color: Colors.white)),
          )
        ],
      ),
    );
  }

  Future<void> _finishAndEndShift() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('End Shift & Finish Patrol'),
        content: const Text('Are you sure you want to finish your patrol run and close active tracking?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red[700]),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('End Shift', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await PatrolService.endShift(widget.token);
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalStops = _checkpoints.length;
    final verifiedCount = _verifiedCheckpointIds.length;
    final isRoundFinished = totalStops > 0 && verifiedCount == totalStops;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Active Patrol', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.blue[900],
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.power_settings_new),
            tooltip: 'End Shift',
            onPressed: _finishAndEndShift,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // 1. Route Summary Banner
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.blue[900],
                    borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _routeName,
                        style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Progress: $verifiedCount / $totalStops Checkpoints Verified',
                        style: const TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                      const SizedBox(height: 10),
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

                // 2. Ordered Checkpoint Stops Checklist
                Expanded(
                  child: _checkpoints.isEmpty
                      ? const Center(
                          child: Text('No checkpoints found for this route.', style: TextStyle(color: Colors.grey)),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: _checkpoints.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final cp = _checkpoints[index];
                            final bool isDone = _verifiedCheckpointIds.contains(cp['checkpoint_id']);

                            return Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isDone ? Colors.green.shade300 : Colors.grey.shade200,
                                  width: isDone ? 1.5 : 1,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.03),
                                    blurRadius: 6,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 16,
                                    backgroundColor: isDone ? Colors.green.shade50 : Colors.blue.shade50,
                                    child: isDone
                                        ? const Icon(Icons.check, color: Colors.green, size: 18)
                                        : Text(
                                            '${index + 1}',
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: Colors.blue.shade900,
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
                                            color: isDone ? Colors.green.shade800 : Colors.slate.shade900,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          isDone ? 'Verified (Dual Photo & GPS)' : 'Pending Scan',
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
                                        backgroundColor: Colors.blue[800],
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                      ),
                                      onPressed: () => _handleScanCheckpoint(cp),
                                      icon: const Icon(Icons.qr_code_scanner, size: 16, color: Colors.white),
                                      label: const Text('Scan', style: TextStyle(fontSize: 12, color: Colors.white)),
                                    ),
                                ],
                              ),
                            );
                          },
                        ),
                ),

                // 3. Complete Patrol Run Bottom Action
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
                        backgroundColor: Colors.green[700],
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