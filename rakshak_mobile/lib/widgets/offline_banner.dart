import 'dart:async';
import 'package:flutter/material.dart';
import '../services/local_db_service.dart';

class OfflineBanner extends StatefulWidget {
  const OfflineBanner({super.key});

  @override
  State<OfflineBanner> createState() => _OfflineBannerState();
}

class _OfflineBannerState extends State<OfflineBanner> {
  int _queuedCount = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _checkQueue();
    
    // Poll the SQLite database every 3 seconds. 
    // This allows the banner to automatically vanish the moment 
    // the Background Sync Engine successfully uploads the data.
    _timer = Timer.periodic(const Duration(seconds: 3), (timer) {
      _checkQueue();
    });
  }

  Future<void> _checkQueue() async {
    final scans = await LocalDbService().getUnsyncedScans();
    if (mounted) {
      // Only trigger a UI rebuild if the count actually changed
      if (_queuedCount != scans.length) {
        setState(() {
          _queuedCount = scans.length;
        });
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // If the queue is empty, the banner collapses and becomes completely invisible
    if (_queuedCount == 0) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 12.0, horizontal: 16.0),
      color: Colors.orange.shade800,
      child: Row(
        children: [
          const Icon(Icons.signal_wifi_connected_no_internet_4, color: Colors.white, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Offline Mode',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                ),
                Text(
                  '$_queuedCount scan${_queuedCount > 1 ? 's' : ''} queued. Waiting for network...',
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(
              color: Colors.white54,
              strokeWidth: 2,
            ),
          ),
        ],
      ),
    );
  }
}