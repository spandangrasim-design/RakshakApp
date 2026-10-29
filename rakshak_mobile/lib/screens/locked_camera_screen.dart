import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image/image.dart' as img;
import 'package:shared_preferences/shared_preferences.dart';
import '../services/token_store.dart';
import 'package:system_clock/system_clock.dart';
import 'package:uuid/uuid.dart';

import '../config/api_config.dart';
import '../services/api_client.dart';
import '../services/local_db_service.dart';
import '../services/sync_service.dart';

class LockedCameraScreen extends StatefulWidget {
  final String checkpointId;
  final double expectedLat;
  final double expectedLng;
  final String signature;

  const LockedCameraScreen({
    super.key,
    required this.checkpointId,
    required this.expectedLat,
    required this.expectedLng,
    required this.signature,
  });

  @override
  State<LockedCameraScreen> createState() => _LockedCameraScreenState();
}

class _LockedCameraScreenState extends State<LockedCameraScreen> {
  List<CameraDescription> _availableCameras = [];
  CameraController? _cameraController;
  Position? _guardPosition;
  bool _isInitializing = true;
  bool _isSubmitting = false;

  // 2-Step Protocol:
  // Step 1: Guard Selfie (Front Camera)
  // Step 2: Location / Checkpoint Proof (Rear Camera)
  int _currentStep = 1;
  String? _selfieBase64;
  String? _locationBase64;

  @override
  void initState() {
    super.initState();
    _initializeHardware();
  }

  Future<void> _initializeHardware() async {
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.whileInUse ||
          permission == LocationPermission.always) {
        _guardPosition = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
        );
      }

      _availableCameras = await availableCameras();
      await _setupCameraForStep(_currentStep);
    } catch (e) {
      debugPrint('Hardware Init Error: $e');
    } finally {
      if (mounted) setState(() => _isInitializing = false);
    }
  }

  Future<void> _setupCameraForStep(int step) async {
    if (_availableCameras.isEmpty) return;

    final targetDirection =
        step == 1 ? CameraLensDirection.front : CameraLensDirection.back;

    final selectedCamera = _availableCameras.firstWhere(
      (c) => c.lensDirection == targetDirection,
      orElse: () => _availableCameras.first,
    );

    if (_cameraController != null) {
      await _cameraController!.dispose();
      _cameraController = null;
    }

    _cameraController = CameraController(
      selectedCamera,
      ResolutionPreset.medium,
      enableAudio: false,
    );

    await _cameraController!.initialize();
    if (mounted) setState(() {});
  }

  void _showSnack(String text, Color color, {int seconds = 4}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: color,
        duration: Duration(seconds: seconds),
      ),
    );
  }

  Future<String?> _processAndStampImage(XFile photoFile, String stepLabel) async {
    final bytes = await photoFile.readAsBytes();
    final img.Image? decodedImage = img.decodeImage(bytes);
    if (decodedImage == null) return null;

    final String timestamp = DateTime.now().toIso8601String();
    final String locationStr = _guardPosition != null
        ? 'Lat: ${_guardPosition!.latitude.toStringAsFixed(6)}, Lng: ${_guardPosition!.longitude.toStringAsFixed(6)}'
        : 'GPS: Unavailable';

    // Inset 30px from left and bottom to prevent edge cutoffs
    final textToDraw = 'Rakshak Proof ($stepLabel)\n$locationStr\nTime: $timestamp';

    img.drawString(
      decodedImage,
      textToDraw,
      font: img.arial24,
      x: 30,
      y: decodedImage.height - 110,
      color: img.ColorRgb8(255, 0, 0),
    );

    final compressedBytes = img.encodeJpg(decodedImage, quality: 60);
    return 'data:image/jpeg;base64,${base64Encode(compressedBytes)}';
  }

  Future<void> _captureAndSubmit() async {
    if (_cameraController == null ||
        !_cameraController!.value.isInitialized ||
        _isSubmitting) {
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final XFile photo = await _cameraController!.takePicture();

      if (_currentStep == 1) {
        // Step 1: Process Guard Selfie
        final selfieString = await _processAndStampImage(photo, 'Guard Selfie');
        if (selfieString == null) throw Exception('Failed to process selfie.');

        _selfieBase64 = selfieString;

        // Refresh live GPS position before taking location proof
        try {
          _guardPosition = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.high,
          );
        } catch (_) {}

        _showSnack(
          'Step 1/2 complete. Switching to rear camera for Checkpoint Proof...',
          Colors.blueAccent,
          seconds: 2,
        );

        // Switch to Step 2
        setState(() {
          _currentStep = 2;
          _isSubmitting = false;
        });

        await _setupCameraForStep(2);
        return;
      }

      // Step 2: Process Location Proof and Submit
      final locationString =
          await _processAndStampImage(photo, 'Checkpoint Proof');
      if (locationString == null) {
        throw Exception('Failed to process checkpoint photo.');
      }
      _locationBase64 = locationString;

      final Duration uptime = SystemClock.uptime();
      final prefs = await SharedPreferences.getInstance();
      final token =
          await TokenStore.read();
      final clientScanId = const Uuid().v4();

      final payload = <String, dynamic>{
        'client_scan_id': clientScanId,
        'checkpoint_id': widget.checkpointId,
        'qr_lat': widget.expectedLat.toString(),
        'qr_lng': widget.expectedLng.toString(),
        'signature': widget.signature,
        'guard_lat': _guardPosition?.latitude ?? widget.expectedLat,
        'guard_lng': _guardPosition?.longitude ?? widget.expectedLng,
        'uptime_seconds': uptime.inSeconds,
        'selfie_url': _selfieBase64,
        'location_photo_url': _locationBase64,
        'photo_url': _locationBase64 ?? _selfieBase64,
      };

      final outcome = await ApiClient.postJson(
        ApiConfig.scansUrl,
        token: token,
        body: payload,
        timeout: const Duration(seconds: 20),
      );

      // Successfully logged online -> return true so the next stop unlocks immediately
      if (outcome.ok && outcome.json?['success'] == true) {
        if (!mounted) return;
        Navigator.pop(context, true);
        return;
      }

      debugPrint('Scan upload failed: ${outcome.failure} ${outcome.describe}');

      if (outcome.shouldQueue) {
        await LocalDbService().queueScan(clientScanId, payload);
        SyncService().initialize();

        final reason = outcome.failure == ApiFailure.network
            ? 'No connection'
            : outcome.failure == ApiFailure.unauthorized
                ? 'Session expired - log in again'
                : 'Server problem (${outcome.describe})';

        _showSnack(
          '$reason: scan saved offline. Both photos will sync automatically.',
          Colors.orange.shade800,
          seconds: 5,
        );
        if (!mounted) return;
        // Queued offline -> return true so guard patrol can continue offline
        Navigator.pop(context, true);
        return;
      }

      final rejectReason = outcome.message.isNotEmpty
          ? outcome.describe
          : (outcome.json?['message']?.toString() ?? 'Server rejected the scan');
      _showSnack('Scan rejected: $rejectReason', Colors.red.shade700, seconds: 8);
    } catch (e) {
      _showSnack('Error processing scan: $e', Colors.red);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isInitializing) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: Colors.blueAccent),
              SizedBox(height: 16),
              Text('Acquiring GPS Lock & Camera...',
                  style: TextStyle(color: Colors.white)),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(
          _currentStep == 1
              ? 'Step 1/2: Guard Selfie'
              : 'Step 2/2: Checkpoint Proof',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          // Step progress indicator bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: Colors.grey.shade900,
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.blueAccent,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    height: 4,
                    decoration: BoxDecoration(
                      color: _currentStep == 2
                          ? Colors.greenAccent
                          : Colors.grey.shade700,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              color: Colors.black,
              child: (_cameraController != null &&
                      _cameraController!.value.isInitialized)
                  ? CameraPreview(_cameraController!)
                  : const Center(
                      child: Text('Initializing Camera...',
                          style: TextStyle(color: Colors.white54)),
                    ),
            ),
          ),
          Container(
            padding: const EdgeInsets.all(24.0),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Live GPS Lock:',
                        style: TextStyle(
                            color: Colors.black54, fontWeight: FontWeight.w600)),
                    Text(
                      _guardPosition != null
                          ? '${_guardPosition!.latitude.toStringAsFixed(5)}, ${_guardPosition!.longitude.toStringAsFixed(5)}'
                          : 'Searching...',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: _guardPosition != null
                            ? Colors.green.shade700
                            : Colors.red,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  _currentStep == 1
                      ? 'Action: Capture clear photo of your face (Front Camera)'
                      : 'Action: Capture the checkpoint tag or location (Rear Camera)',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: _currentStep == 1
                        ? Colors.blue.shade800
                        : Colors.green.shade800,
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                  onPressed: _isSubmitting ? null : _captureAndSubmit,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    backgroundColor: _currentStep == 1
                        ? const Color(0xFF1E3A8A)
                        : const Color(0xFF15803D),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: _isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2))
                      : Icon(_currentStep == 1
                          ? Icons.camera_front
                          : Icons.camera_alt),
                  label: Text(_isSubmitting
                      ? (_currentStep == 1
                          ? 'Processing Selfie...'
                          : 'Submitting Verification...')
                      : (_currentStep == 1
                          ? 'Capture Guard Selfie (1/2)'
                          : 'Capture Checkpoint Proof (2/2)')),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}