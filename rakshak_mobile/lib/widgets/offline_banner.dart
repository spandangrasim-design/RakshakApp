import 'dart:async';

import 'package:flutter/material.dart';

import '../services/local_db_service.dart';
import '../services/sync_service.dart';

/// Shows how many scans / incidents are waiting in the offline queue.
/// Disappears automatically once everything has been uploaded.
/// Tap it to force a sync attempt.
class OfflineBanner extends StatefulWidget {
  const OfflineBanner({super.key});

  @override
  State<OfflineBanner> createState() => _OfflineBannerState();
}

class _OfflineBannerState extends State<OfflineBanner> {
  int _queuedScans = 0;
  int _queuedIncidents = 0;
  Timer? _timer;

  int get _total => _queuedScans + _queuedIncidents;

  @override
  void initState() {
    super.initState();
    _checkQueue();

    // Cheap COUNT(*) query every 3 seconds, so the banner vanishes as soon as
    // the sync engine has uploaded everything.
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _checkQueue());
  }

  Future<void> _checkQueue() async {
    try {
      final db = LocalDbService();
      final scans = await db.pendingScanCount();
      final incidents = await db.pendingIncidentCount();
      if (!mounted) return;
      if (scans != _queuedScans || incidents != _queuedIncidents) {
        setState(() {
          _queuedScans = scans;
          _queuedIncidents = incidents;
        });
      }
    } catch (_) {
      // Ignore transient database errors
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _summary {
    final parts = <String>[];
    if (_queuedScans > 0) {
      parts.add('$_queuedScans scan${_queuedScans > 1 ? 's' : ''}');
    }
    if (_queuedIncidents > 0) {
      parts.add(
          '$_queuedIncidents incident${_queuedIncidents > 1 ? 's' : ''}');
    }
    return '${parts.join(' and ')} waiting to upload. Tap to retry now.';
  }

  @override
  Widget build(BuildContext context) {
    if (_total == 0) return const SizedBox.shrink();

    return Material(
      color: Colors.orange.shade800,
      child: InkWell(
        onTap: () async {
          await SyncService().syncNow();
          await _checkQueue();
        },
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 12.0, horizontal: 16.0),
          child: Row(
            children: [
              const Icon(Icons.cloud_upload_outlined,
                  color: Colors.white, size: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Pending upload',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    Text(
                      _summary,
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 13),
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
        ),
      ),
    );
  }
}
