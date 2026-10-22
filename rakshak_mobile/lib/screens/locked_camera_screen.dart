import 'package:flutter/material.dart';

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
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Checkpoint: ${widget.checkpointId}'),
        backgroundColor: Colors.blueAccent,
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.camera_alt, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text('Ready to verify GPS at:'),
            Text('${widget.expectedLat}, ${widget.expectedLng}', style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                // TODO: Initialize camera, capture photo, watermark, and send to backend
              },
              child: const Text('Initialize Locked Camera'),
            ),
          ],
        ),
      ),
    );
  }
}