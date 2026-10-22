import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:geolocator/geolocator.dart';
import 'package:system_clock/system_clock.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img; 

class LockedCameraScreen extends StatefulWidget {
  final String checkpointId;
  final double expectedLat;
  final double expectedLng;
  final String signature;

  // TODO: Replace with your actual Cloudflare Worker URL
  static const String API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/'; 

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
  CameraController? _cameraController;
  Position? _guardPosition;
  bool _isInitializing = true;
  bool _isSubmitting = false;

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
      
      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
        _guardPosition = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      }

      final cameras = await availableCameras();
      if (cameras.isNotEmpty) {
        final frontCamera = cameras.firstWhere(
          (c) => c.lensDirection == CameraLensDirection.front,
          orElse: () => cameras.first,
        );
        
        _cameraController = CameraController(
          frontCamera,
          ResolutionPreset.medium, 
          enableAudio: false,
        );
        await _cameraController!.initialize();
      }
    } catch (e) {
      debugPrint("Hardware Init Error: $e");
    } finally {
      if (mounted) setState(() => _isInitializing = false);
    }
  }

  Future<void> _captureAndSubmit() async {
    setState(() => _isSubmitting = true);

    try {
      String photoBase64 = "";

      if (_cameraController != null && _cameraController!.value.isInitialized) {
        final XFile photo = await _cameraController!.takePicture();
        final bytes = await photo.readAsBytes();
        
        img.Image? decodedImage = img.decodeImage(bytes);
        if (decodedImage != null) {
          final String timestamp = DateTime.now().toIso8601String();
          final String locationStr = _guardPosition != null 
              ? "Lat: ${_guardPosition!.latitude}, Lng: ${_guardPosition!.longitude}"
              : "GPS: Unavailable";
          
          img.drawString(
            decodedImage, 
            'Rakshak Verified\n$locationStr\nTime: $timestamp', 
            font: img.arial_24, 
            color: img.ColorRgb8(255, 0, 0)
          );

          final compressedBytes = img.encodeJpg(decodedImage, quality: 60);
          photoBase64 = "data:image/jpeg;base64,${base64Encode(compressedBytes)}";
        }
      }

      final Duration uptime = SystemClock.uptime();
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('access_token') ?? '';

      final payload = {
        "checkpoint_id": widget.checkpointId,
        "qr_lat": widget.expectedLat.toString(),
        "qr_lng": widget.expectedLng.toString(),
        "signature": widget.signature,
        "guard_lat": _guardPosition?.latitude ?? widget.expectedLat, 
        "guard_lng": _guardPosition?.longitude ?? widget.expectedLng,
        "uptime_seconds": uptime.inSeconds,
        "photo_url": photoBase64
      };

      final response = await http.post(
        Uri.parse('${LockedCameraScreen.API_BASE_URL}/api/v1/scans'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode(payload),
      );

      final responseData = jsonDecode(response.body);

      if (response.statusCode == 200 && responseData['success'] == true) {
        final verification = responseData['verification'];
        final isVerified = verification['is_gps_verified'];

        if (!mounted) return;
        Navigator.pop(context, isVerified);
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Submission Failed: ${responseData['message'] ?? 'Server error'}'),
            backgroundColor: Colors.red,
          ),
        );
      }

    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error submitting scan: $e'), backgroundColor: Colors.red),
      );
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
              Text('Acquiring GPS Lock & Camera...', style: TextStyle(color: Colors.white)),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text('Checkpoint: ${widget.checkpointId}', style: const TextStyle(fontSize: 16)),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              width: double.infinity,
              color: Colors.grey.shade900,
              child: (_cameraController != null && _cameraController!.value.isInitialized)
                  ? CameraPreview(_cameraController!)
                  : const Center(child: Text('Camera Error', style: TextStyle(color: Colors.white54))),
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
                    const Text('Live GPS Lock:', style: TextStyle(color: Colors.black54, fontWeight: FontWeight.w600)),
                    Text(
                      _guardPosition != null 
                        ? '${_guardPosition!.latitude.toStringAsFixed(5)}, ${_guardPosition!.longitude.toStringAsFixed(5)}'
                        : 'Searching...',
                      style: TextStyle(
                        fontWeight: FontWeight.bold, 
                        color: _guardPosition != null ? Colors.green.shade700 : Colors.red,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: _isSubmitting ? null : _captureAndSubmit,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    backgroundColor: const Color(0xFF1E3A8A),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: _isSubmitting 
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(Icons.camera_alt),
                  label: Text(_isSubmitting ? 'Processing & Verifying...' : 'Capture & Verify'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}