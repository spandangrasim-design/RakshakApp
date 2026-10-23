import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import 'api_client.dart';
import 'local_db_service.dart';

/// Uploads everything saved in the local offline queue (patrol scans and
/// incident reports).
///
/// Sync runs:
///  * once at app start,
///  * whenever the device regains a connection,
///  * every 60 seconds while the app is open (covers the case where the
///    server was briefly failing while the phone itself was online),
///  * on demand via [syncNow].
class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService() => _instance;
  SyncService._internal();

  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  Timer? _retryTimer;
  bool _isSyncing = false;

  static bool hasConnection(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);

  /// Safe to call many times - listeners are only attached once.
  void initialize() {
    _connectivitySub ??=
        Connectivity().onConnectivityChanged.listen((results) {
      if (hasConnection(results)) syncNow();
    });

    _retryTimer ??= Timer.periodic(
      const Duration(seconds: 60),
      (_) => syncNow(),
    );

    syncNow();
  }

  /// Try to upload everything that is queued right now.
  Future<void> syncNow() async {
    if (_isSyncing) return; // prevent overlapping syncs
    _isSyncing = true;

    try {
      final prefs = await SharedPreferences.getInstance();
      final token =
          prefs.getString('access_token') ?? prefs.getString('token') ?? '';
      if (token.isEmpty) return; // not logged in yet

      await _syncPatrolScans(token);
      await _syncIncidents(token);
    } catch (e) {
      debugPrint('Background sync error: $e');
    } finally {
      _isSyncing = false;
    }
  }

  // ==========================================
  // PATROL SCANS
  // ==========================================
  Future<void> _syncPatrolScans(String token) async {
    final scans = await LocalDbService().getUnsyncedScans();
    if (scans.isEmpty) return;

    final outcome = await ApiClient.postJson(
      ApiConfig.patrolSyncUrl,
      token: token,
      body: {'scans': scans},
      timeout: const Duration(seconds: 30),
    );

    if (!outcome.ok) {
      debugPrint('Scan sync failed (${outcome.describe}). Will retry later.');
      return;
    }

    final items = outcome.json?['synced_items'];
    if (items is! List) return;

    final syncedIds = <String>[];
    for (final item in items) {
      if (item is Map &&
          item['status'] != 'failed' &&
          item['client_scan_id'] != null) {
        syncedIds.add(item['client_scan_id'].toString());
      }
    }

    await LocalDbService().removeSyncedScans(syncedIds);
  }

  // ==========================================
  // INCIDENT REPORTS
  // ==========================================
  Future<void> _syncIncidents(String token) async {
    final incidents = await LocalDbService().getUnsyncedIncidents();
    if (incidents.isEmpty) return;

    final syncedIds = <String>[];

    // One by one - each incident may contain a large base64 photo.
    for (final incident in incidents) {
      final id = incident['client_incident_id'].toString();

      final outcome = await ApiClient.postJson(
        ApiConfig.incidentsUrl, // same URL as the live upload
        token: token,
        body: incident,
        timeout: const Duration(seconds: 40),
      );

      // 409 = the server already has this incident (duplicate) -> done.
      if (outcome.ok || outcome.statusCode == 409) {
        syncedIds.add(id);
      } else {
        debugPrint('Incident $id not synced (${outcome.describe}).');
        // No connection at all: no point trying the rest right now.
        if (outcome.failure == ApiFailure.network) break;
      }
    }

    await LocalDbService().removeSyncedIncidents(syncedIds);
  }
}
