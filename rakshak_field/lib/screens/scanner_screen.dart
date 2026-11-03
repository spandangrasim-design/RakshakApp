import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Full-screen QR scanner. Pops with the raw text of the first Rakshak checkpoint QR it sees.
///
/// Camera start-up follows the proven pattern of the main Rakshak app: the camera is started by hand
/// AFTER the screen transition finishes (the native preview is not ready before that), start/stop calls
/// are serialized, and the camera is released/resumed with the app lifecycle.
class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> with WidgetsBindingObserver {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    facing: CameraFacing.back,
    formats: const [BarcodeFormat.qrCode],
    autoStart: false,
  );

  Future<void> _cameraQueue = Future<void>.value();
  bool _isDisposing = false;
  bool _found = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final animation = ModalRoute.of(context)?.animation;
      if (animation != null && !animation.isCompleted) {
        animation.addStatusListener((status) {
          if (status == AnimationStatus.completed && mounted) _startScanner();
        });
      } else {
        Future.delayed(const Duration(milliseconds: 250), () {
          if (mounted) _startScanner();
        });
      }
    });
  }

  Future<void> _queue(Future<void> Function() operation) {
    final next = _cameraQueue.catchError((Object _) {}).then((_) => operation());
    _cameraQueue = next.catchError((Object error) {
      debugPrint('Camera operation failed: $error');
    });
    return next;
  }

  Future<void> _startScanner() {
    return _queue(() async {
      if (!mounted || _isDisposing || _found) return;
      if (_controller.value.isRunning) return;
      try {
        await _controller.start();
        if (mounted) setState(() {});
      } catch (error) {
        debugPrint('Could not start QR scanner: $error');
        if (mounted) setState(() {});
      }
    });
  }

  Future<void> _stopScanner() {
    return _queue(() async {
      if (_isDisposing || !_controller.value.isRunning) return;
      try {
        await _controller.stop();
      } catch (error) {
        debugPrint('Could not stop QR scanner: $error');
      }
    });
  }

  Future<void> _restartCamera() async {
    await _stopScanner();
    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;
    await _startScanner();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (!_found) _startScanner();
    } else {
      _stopScanner();
    }
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_found) return;
    for (final b in capture.barcodes) {
      final v = b.rawValue;
      if (v != null && v.startsWith('rakshak://cp')) {
        _found = true;
        await _stopScanner();
        if (mounted) Navigator.of(context).pop(v);
        return;
      }
    }
  }

  @override
  void dispose() {
    _isDisposing = true;
    WidgetsBinding.instance.removeObserver(this);
    _cameraQueue = _cameraQueue.catchError((Object _) {}).then((_) async {
      try {
        if (_controller.value.isRunning) await _controller.stop();
      } catch (_) {
        // The platform may already have released the camera.
      }
      await _controller.dispose();
    }).catchError((Object error) {
      debugPrint('Could not dispose QR scanner: $error');
    });
    super.dispose();
  }

  Widget _errorView(MobileScannerException error) {
    debugPrint('QR camera error ${error.errorCode.name}: ${error.errorDetails?.message}');
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.camera_alt_outlined, color: Colors.amber, size: 54),
            const SizedBox(height: 12),
            Text(
              denied ? 'Camera permission needed' : 'Camera error: ${error.errorCode.name}',
              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              denied
                  ? 'Open Settings > Apps > Rakshak Field > Permissions and allow Camera, then tap Retry.'
                  : 'Close any other app using the camera, then tap Retry.',
              style: const TextStyle(color: Colors.white70, fontSize: 13),
              textAlign: TextAlign.center,
            ),
            if ((error.errorDetails?.message ?? '').isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                error.errorDetails!.message!,
                style: const TextStyle(color: Colors.white38, fontSize: 11),
                textAlign: TextAlign.center,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            const SizedBox(height: 20),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent),
              icon: const Icon(Icons.refresh, color: Colors.white),
              label: const Text('Retry camera', style: TextStyle(color: Colors.white)),
              onPressed: _restartCamera,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Scan checkpoint QR', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error, child) => _errorView(error),
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
            bottom: 48,
            child: Text(
              'Point the camera at the QR code on the wall',
              style: TextStyle(color: Colors.white, fontSize: 15),
            ),
          ),
        ],
      ),
    );
  }
}
