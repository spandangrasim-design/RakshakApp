import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'locked_camera_screen.dart';

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final MobileScannerController _scannerController = MobileScannerController();
  bool _isProcessing = false;

  void _onDetect(BarcodeCapture capture) {
    // Prevent multiple triggers from the same scan
    if (_isProcessing) return;

    final List<Barcode> barcodes = capture.barcodes;
    for (final barcode in barcodes) {
      final rawValue = barcode.rawValue;
      
      // Validate it is our proprietary QR code format
      if (rawValue != null && rawValue.startsWith('rakshak://cp')) {
        setState(() => _isProcessing = true);
        _scannerController.stop();

        try {
          final uri = Uri.parse(rawValue);
          final checkpointId = uri.queryParameters['id'];
          final lat = uri.queryParameters['lat'];
          final lng = uri.queryParameters['lng'];
          final signature = uri.queryParameters['s'];

          if (checkpointId != null && lat != null && lng != null && signature != null) {
            // Success! Route the extracted data to the Locked Camera Screen
            Navigator.pushReplacement(
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
            return;
          }
        } catch (e) {
          debugPrint("Failed to parse QR Data: $e");
        }
        
        // If parsing fails or data is missing, resume scanning
        setState(() => _isProcessing = false);
        _scannerController.start();
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
          MobileScanner(
            controller: _scannerController,
            onDetect: _onDetect,
          ),
          // Simple visual overlay for the scanner
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
            const Container(
              color: Colors.black54,
              child: Center(child: CircularProgressIndicator(color: Colors.blueAccent)),
            ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }
}