import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'locked_camera_screen.dart';

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> with WidgetsBindingObserver {
  MobileScannerController? _scannerController;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    
    // Defer controller initialization until the native view is mounted
    _scannerController = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing: CameraFacing.back,
      autoStart: false,
    );

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (mounted && _scannerController != null) {
        try {
          await _scannerController!.start();
          if (mounted) setState(() {});
        } catch (e) {
          debugPrint("Scanner initialization error: $e");
        }
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_scannerController == null) return;
    if (state == AppLifecycleState.resumed) {
      _scannerController!.start();
    } else if (state == AppLifecycleState.paused) {
      _scannerController!.stop();
    }
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_isProcessing) return;

    final List<Barcode> barcodes = capture.barcodes;
    for (final barcode in barcodes) {
      final rawValue = barcode.rawValue;
      
      if (rawValue != null && rawValue.startsWith('rakshak://cp')) {
        setState(() => _isProcessing = true);
        await _scannerController?.stop();

        try {
          final uri = Uri.parse(rawValue);
          final checkpointId = uri.queryParameters['id'];
          final lat = uri.queryParameters['lat'];
          final lng = uri.queryParameters['lng'];
          final signature = uri.queryParameters['s'];

          if (checkpointId != null && lat != null && lng != null && signature != null) {
            final result = await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => LockedCameraScreen(
                  checkpointId: checkpointId,
                  expectedLat: double.parse(lat),
                  expectedLng: double.parse(lng),
                  signature: signature,
                ),
              ),
            );
            
            if (mounted) {
              Navigator.pop(context, result);
            }
            return;
          }
        } catch (e) {
          debugPrint("Failed to parse QR Data: $e");
        }
        
        setState(() => _isProcessing = false);
        await _scannerController?.start();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Scan Checkpoint', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        alignment: Alignment.center,
        children: [
          if (_scannerController != null)
            MobileScanner(
              controller: _scannerController,
              onDetect: _onDetect,
              errorBuilder: (context, error, child) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.camera_alt_outlined, color: Colors.amber, size: 54),
                        const SizedBox(height: 12),
                        const Text(
                          'Starting Camera...',
                          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          error.errorDetails?.message ?? 'Connecting to Android camera hardware.',
                          style: const TextStyle(color: Colors.white70, fontSize: 13),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 20),
                        ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent),
                          icon: const Icon(Icons.refresh, color: Colors.white),
                          label: const Text('Restart Camera', style: TextStyle(color: Colors.white)),
                          onPressed: () async {
                            try {
                              await _scannerController?.stop();
                              await _scannerController?.start();
                              setState(() {});
                            } catch (_) {}
                          },
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.blueAccent, width: 3),
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          const Positioned(
            bottom: 40,
            child: Text(
              'Align QR code within the frame',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500),
            ),
          ),
          if (_isProcessing)
            Container(
              color: Colors.black54,
              child: const Center(child: CircularProgressIndicator(color: Colors.blueAccent)),
            ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scannerController?.dispose();
    super.dispose();
  }
}