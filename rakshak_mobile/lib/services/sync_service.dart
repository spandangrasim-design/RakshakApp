import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'local_db_service.dart';
import '../screens/locked_camera_screen.dart'; 

class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService() => _instance;
  SyncService._internal();

  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _isSyncing = false;

  void initialize() {
    // Listen for network changes in the background
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((List<ConnectivityResult> results) {
      // If the phone reconnects to Mobile Data or Wi-Fi, trigger the sync
      if (results.contains(ConnectivityResult.mobile) || results.contains(ConnectivityResult.wifi)) {
        debugPrint("Network connected! Attempting to sync offline scans...");
        syncPendingScans();
      }
    });
  }

  Future<void> syncPendingScans() async {
    if (_isSyncing) return; // Prevent overlapping syncs
    _isSyncing = true;

    try {
      // 1. Fetch trapped scans from the local phone database
      final pendingScans = await LocalDbService().getUnsyncedScans();
      if (pendingScans.isEmpty) {
        _isSyncing = false;
        return;
      }

      // 2. Get the guard's JWT token
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('access_token') ?? '';

      if (token.isEmpty) {
         _isSyncing = false;
         return;
      }

      // 3. Send bulk payload to Cloudflare Auto-Sync endpoint
      final response = await http.post(
        Uri.parse('${LockedCameraScreen.API_BASE_URL}/api/v1/patrols/sync'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({"scans": pendingScans}),
      );

      // 4. If successful, clear ONLY the uploaded scans from the local phone queue
      if (response.statusCode == 200) {
        final responseData = jsonDecode(response.body);
        if (responseData['success'] == true) {
          final List syncedItems = responseData['synced_items'] ?? [];
          
          List<String> successfulIds = [];
          for (var item in syncedItems) {
             // Only flag it for local deletion if the backend successfully saved it
            if (item['status'] != 'failed') {
              successfulIds.add(item['client_scan_id']);
            }
          }

          // SAFE DELETION: This ONLY deletes rows in the phone's local SQLite database.
          // It does NOT touch your Supabase backend.
          if (successfulIds.isNotEmpty) {
            await LocalDbService().removeSyncedScans(successfulIds);
            debugPrint("Successfully synced ${successfulIds.length} offline scans.");
          }
        }
      }
    } catch (e) {
      debugPrint("Auto-sync failed, will retry later: $e");
    } finally {
      _isSyncing = false;
    }
  }

  void dispose() {
    _connectivitySubscription?.cancel();
  }
}