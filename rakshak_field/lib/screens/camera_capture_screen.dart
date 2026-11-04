import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

/// Opens the in-app camera (with a front/back switch) and returns the JPEG bytes, or null if cancelled.
Future<Uint8List?> captureImage(
  BuildContext context, {
  required String title,
  required bool startFront,
}) {
  return Navigator.of(context).push<Uint8List>(
    MaterialPageRoute(builder: (_) => CameraCaptureScreen(title: title, startFront: startFront)),
  );
}

class CameraCaptureScreen extends StatefulWidget {
  final String title;
  final bool startFront;

  const CameraCaptureScreen({super.key, required this.title, required this.startFront});

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen> with WidgetsBindingObserver {
  List<CameraDescription> _cameras = [];
  CameraController? _controller;
  late CameraLensDirection _lens;

  bool _opening = true;
  bool _capturing = false;
  String? _error;
  Uint8List? _shot;

  @override
  void initState() {
    super.initState();
    _lens = widget.startFront ? CameraLensDirection.front : CameraLensDirection.back;
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    setState(() {
      _opening = true;
      _error = null;
    });
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) throw Exception('No camera found');
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'No camera was found on this phone.';
        _opening = false;
      });
      return;
    }
    await _openWithRetry(_lens);
  }

  /// The very first start shows Android's camera-permission prompt, which can make the first attempt fail.
  /// So try a few times quietly before ever showing an error.
  Future<void> _openWithRetry(CameraLensDirection lens) async {
    for (var attempt = 0; attempt < 4; attempt++) {
      if (!mounted) return;
      if (await _open(lens)) return;
      await Future.delayed(const Duration(milliseconds: 900));
    }
    if (!mounted) return;
    setState(() {
      _error = 'The camera could not start. Allow camera access and close other apps using it.';
      _opening = false;
    });
  }

  /// Returns true when the preview is running.
  Future<bool> _open(CameraLensDirection lens) async {
    if (!mounted) return false;
    setState(() {
      _opening = true;
      _error = null;
    });

    final old = _controller;
    _controller = null;
    try {
      await old?.dispose();
    } catch (_) {}

    CameraController? controller;
    try {
      final description = _cameras.firstWhere(
        (c) => c.lensDirection == lens,
        orElse: () => _cameras.first,
      );
      controller = CameraController(description, ResolutionPreset.medium, enableAudio: false);
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return true;
      }
      setState(() {
        _controller = controller;
        _lens = description.lensDirection;
        _opening = false;
      });
      return true;
    } catch (_) {
      try {
        await controller?.dispose();
      } catch (_) {}
      return false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // While the camera is still opening (e.g. the permission dialog is on screen) do nothing.
    if (_opening) return;
    final c = _controller;
    if (state == AppLifecycleState.inactive) {
      if (c != null) {
        _controller = null;
        c.dispose();
        if (mounted) setState(() {});
      }
    } else if (state == AppLifecycleState.resumed && _controller == null && _shot == null && _cameras.isNotEmpty) {
      _openWithRetry(_lens);
    }
  }

  bool get _canSwitch =>
      _cameras.any((c) => c.lensDirection == CameraLensDirection.front) &&
      _cameras.any((c) => c.lensDirection == CameraLensDirection.back);

  Future<void> _switch() async {
    if (_opening || _capturing) return;
    await _openWithRetry(_lens == CameraLensDirection.front ? CameraLensDirection.back : CameraLensDirection.front);
  }

  Future<void> _capture() async {
    final c = _controller;
    if (c == null || !c.value.isInitialized || _capturing) return;
    setState(() => _capturing = true);
    try {
      final photo = await c.takePicture();
      final bytes = await photo.readAsBytes();
      if (!mounted) return;
      setState(() {
        _shot = bytes;
        _capturing = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _capturing = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not take the photo. Try again.')));
    }
  }

  /// Fallback if the in-app camera fails on some phones: use the phone's own camera app.
  Future<void> _useCameraApp() async {
    try {
      final shot = await ImagePicker().pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: _lens == CameraLensDirection.front ? CameraDevice.front : CameraDevice.rear,
        maxWidth: 1280,
        maxHeight: 1280,
        imageQuality: 70,
      );
      if (shot == null) return;
      final bytes = await shot.readAsBytes();
      if (!mounted) return;
      setState(() => _shot = bytes);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the camera app.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(widget.title, style: const TextStyle(color: Colors.white)),
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_shot != null) {
      return Column(
        children: [
          Expanded(child: Center(child: Image.memory(_shot!))),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                    onPressed: () {
                      setState(() => _shot = null);
                      if (_controller == null) _openWithRetry(_lens);
                    },
                    child: const Text('Retake'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(_shot),
                    child: const Text('Use this photo'),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.camera_alt_outlined, color: Colors.amber, size: 54),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _init,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _useCameraApp,
                child: const Text('Use the phone camera app instead'),
              ),
            ],
          ),
        ),
      );
    }

    final c = _controller;
    if (_opening || c == null || !c.value.isInitialized) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }

    return Column(
      children: [
        Expanded(child: Center(child: CameraPreview(c))),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 24),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              SizedBox(
                width: 56,
                child: _canSwitch
                    ? IconButton(
                        onPressed: _switch,
                        iconSize: 30,
                        color: Colors.white,
                        tooltip: 'Switch camera',
                        icon: const Icon(Icons.cameraswitch_outlined),
                      )
                    : null,
              ),
              GestureDetector(
                onTap: _capture,
                child: Container(
                  width: 72,
                  height: 72,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3)),
                  child: Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _capturing ? Colors.grey : Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 56),
            ],
          ),
        ),
      ],
    );
  }
}
