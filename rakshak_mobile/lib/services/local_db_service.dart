import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'dart:convert';

class LocalDbService {
  static final LocalDbService _instance = LocalDbService._internal();
  static Database? _database;

  factory LocalDbService() => _instance;
  LocalDbService._internal();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB();
    return _database!;
  }

  Future<Database> _initDB() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'rakshak_offline.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE offline_scans (
            client_scan_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        ''');
      },
    );
  }

  // Save a failed scan to the local queue
  Future<void> queueScan(String clientScanId, Map<String, dynamic> payload) async {
    final db = await database;
    await db.insert(
      'offline_scans',
      {
        'client_scan_id': clientScanId,
        'payload': jsonEncode(payload),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  // Retrieve all queued scans for the Auto-Sync Engine
  Future<List<Map<String, dynamic>>> getUnsyncedScans() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query('offline_scans', orderBy: 'created_at ASC');
    
    return maps.map((map) {
      final payload = jsonDecode(map['payload'] as String) as Map<String, dynamic>;
      // Ensure the ID is injected back into the payload for the backend
      payload['client_scan_id'] = map['client_scan_id'];
      return payload;
    }).toList();
  }

  // Remove scans that successfully uploaded to Cloudflare
  Future<void> removeSyncedScans(List<String> syncedIds) async {
    if (syncedIds.isEmpty) return;
    final db = await database;
    await db.delete(
      'offline_scans',
      where: 'client_scan_id IN (${List.filled(syncedIds.length, '?').join(',')})',
      whereArgs: syncedIds,
    );
  }
}