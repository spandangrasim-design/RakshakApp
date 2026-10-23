import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'locked_camera_screen.dart';

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen>
    with WidgetsBindingObserver {
  // This screen owns camera startup so lifecycle and retry calls can be serialized.
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    facing: CameraFacing.back,
    autoStart: false,
  );

  Future<void> _cameraQueue = Future<void>.value();
  bool _isProcessing = false;
  bool _isNavigatingAway = false;
  bool _isDisposing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _startScanner();
    });
  }

  Future<void> _queueCameraOperation(Future<void> Function() operation) {
    final nextOperation = _cameraQueue
        .catchError((Object _) {})
        .then((_) => operation());
    _cameraQueue = nextOperation.catchError((Object error) {
      debugPrint('Camera operation failed: $error');
    });
    return nextOperation;
  }

  Future<void> _startScanner() {
    return _queueCameraOperation(() async {
      if (!mounted || _isDisposing || _isNavigatingAway) return;
      if (_scannerController.value.isRunning) return;

      try {
        await _scannerController.start();
      } catch (error) {
        debugPrint('Could not start QR scanner: $error');
      }
    });
  }

  Future<void> _stopScanner() {
    return _queueCameraOperation(() async {
      if (_isDisposing || !_scannerController.value.isRunning) return;

      try {
        await _scannerController.stop();
      } catch (error) {
        debugPrint('Could not stop QR scanner: $error');
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Permission dialogs can trigger lifecycle changes before the first
      // camera start has completed. The pending start will handle that case.
      if (_scannerController.value.isInitialized &&
          !_isNavigatingAway &&
          !_isProcessing) {
        _startScanner();
      }
    } else {
      _stopScanner();
    }
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_isProcessing) return;

    for (final barcode in capture.barcodes) {
      final rawValue = barcode.rawValue;
      if (rawValue == null || !rawValue.startsWith('rakshak://cp')) continue;

      setState(() => _isProcessing = true);

      try {
        final uri = Uri.parse(rawValue);
        final checkpointId = uri.queryParameters['id'];
        final lat = uri.queryParameters['lat'];
        final lng = uri.queryParameters['lng'];
        final signature = uri.queryParameters['s'];

        if (checkpointId != null &&
            lat != null &&
            lng != null &&
            signature != null) {
          _isNavigatingAway = true;
          await _stopScanner();

          if (!mounted) return;
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

          if (mounted) Navigator.pop(context, result);
          return;
        }
      } catch (e) {
        debugPrint('Failed to parse QR Data: $e');
      }

      // Invalid QR: resume scanning
      _isNavigatingAway = false;
      if (mounted) {
        setState(() => _isProcessing = false);
        await _startScanner();
      }
      return;
    }
  }

  Future<void> _restartCamera() async {
    await _stopScanner();
    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;
    await _startScanner();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Scan Checkpoint',
            style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(
            controller: _scannerController,
            onDetect: _onDetect,
            errorBuilder: (context, error, child) {
              debugPrint(
                'QR camera error ${error.errorCode.name}: ${error.errorDetails?.message}',
              );
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.camera_alt_outlined,
                          color: Colors.amber, size: 54),
                      const SizedBox(height: 12),
                      Text(
                        'Camera Error: ${error.errorCode.name}',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Allow camera access and close any other app using the camera, then try again.',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 13),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 20),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blueAccent),
                        icon: const Icon(Icons.refresh, color: Colors.white),
                        label: const Text('Retry Camera',
                            style: TextStyle(color: Colors.white)),
                        onPressed: _restartCamera,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
          IgnorePointer(
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.blueAccent, width: 3),
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const Positioned(
            bottom: 40,
            child: Text(
              'Align QR code within the frame',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w500),
            ),
          ),
          if (_isProcessing)
            Container(
              color: Colors.black54,
              child: const Center(
                  child: CircularProgressIndicator(color: Colors.blueAccent)),
            ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _isDisposing = true;
    WidgetsBinding.instance.removeObserver(this);
    _cameraQueue = _cameraQueue
        .catchError((Object _) {})
        .then((_) async {
          try {
            if (_scannerController.value.isRunning) {
              await _scannerController.stop();
            }
          } catch (_) {
            // The camera may already have been released by the platform.
          }
          await _scannerController.dispose();
        })
        .catchError((Object error) {
          debugPrint('Could not dispose QR scanner: $error');
        });
    super.dispose();
  }
}
