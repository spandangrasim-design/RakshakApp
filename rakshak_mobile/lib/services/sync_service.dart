import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'local_db_service.dart';
import '../screens/locked_camera_screen.dart'; // Adjust import if your API_BASE_URL is stored elsewhere

class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService() => _instance;
  SyncService._internal();

  bool _isSyncing = false;

  void initialize() {
    // Listen for network changes (Wi-Fi or Mobile Data returning)
    Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {
      if (results.contains(ConnectivityResult.mobile) || results.contains(ConnectivityResult.wifi)) {
        _syncAllOfflineData();
      }
    });
  }

  Future<void> _syncAllOfflineData() async {
    if (_isSyncing) return; // Prevent overlapping syncs
    _isSyncing = true;

    try {
      await _syncPatrolScans();
      await _syncIncidents(); // NEW: Fire the incident sync
    } catch (e) {
      debugPrint('Background sync error: $e');
    } finally {
      _isSyncing = false;
    }
  }

  // ==========================================
  // SPRINT 4: SYNC PATROL SCANS
  // ==========================================
  Future<void> _syncPatrolScans() async {
    final scans = await LocalDbService().getUnsyncedScans();
    if (scans.isEmpty) return;

    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    if (token == null) return;

    try {
      final response = await http.post(
        Uri.parse('${LockedCameraScreen.API_BASE_URL}/patrols/sync'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({'scans': scans}),
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final syncedItems = data['synced_items'] as List;
        
        // Extract the IDs that were successfully saved by the server
        final List<String> successfullySyncedIds = syncedItems
            .where((item) => item['status'] != 'failed')
            .map((item) => item['client_scan_id'] as String)
            .toList();

        await LocalDbService().removeSyncedScans(successfullySyncedIds);
      }
    } catch (e) {
      debugPrint('Scan sync failed. Will retry later: $e');
    }
  }

  // ==========================================
  // SPRINT 5: SYNC INCIDENT REPORTS
  // ==========================================
  Future<void> _syncIncidents() async {
    final incidents = await LocalDbService().getUnsyncedIncidents();
    if (incidents.isEmpty) return;

    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    if (token == null) return;

    List<String> successfullySyncedIds = [];

    // Sync incidents one by one (since they might contain large base64 photos)
    for (var incident in incidents) {
      try {
        final response = await http.post(
          Uri.parse('${LockedCameraScreen.API_BASE_URL}/incidents'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode(incident),
        ).timeout(const Duration(seconds: 20)); // slightly longer timeout for photos

        if (response.statusCode == 200 || response.statusCode == 201) {
          successfullySyncedIds.add(incident['client_incident_id']);
        }
      } catch (e) {
        debugPrint('Incident sync failed for ${incident['client_incident_id']}. Will retry later.');
      }
    }

    if (successfullySyncedIds.isNotEmpty) {
      await LocalDbService().removeSyncedIncidents(successfullySyncedIds);
    }
  }
}