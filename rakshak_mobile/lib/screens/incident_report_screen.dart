import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../config/api_config.dart';
import '../services/api_client.dart';
import '../services/local_db_service.dart';
import '../services/sync_service.dart';

class IncidentReportScreen extends StatefulWidget {
  const IncidentReportScreen({super.key});

  @override
  State<IncidentReportScreen> createState() => _IncidentReportScreenState();
}

class _IncidentReportScreenState extends State<IncidentReportScreen> {
  final TextEditingController _descriptionController = TextEditingController();
  String _selectedPriority = 'P4';
  bool _isSubmitting = false;

  String? _photoBase64;
  final ImagePicker _picker = ImagePicker();

  final Map<String, String> _priorityLabels = {
    'P1': 'P1 - Critical (Intruder, Fire, Medical)',
    'P2': 'P2 - High (Broken Door, Vandalism)',
    'P3': 'P3 - Medium (Suspicious Activity)',
    'P4': 'P4 - Low (Maintenance Issue, Light Bulb)',
  };

  Future<void> _capturePhoto() async {
    try {
      final XFile? photo = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 50, // compress to save bandwidth
        maxWidth: 1024,
      );

      if (photo != null) {
        final bytes = await photo.readAsBytes();
        if (!mounted) return;
        setState(() {
          _photoBase64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
        });
      }
    } catch (e) {
      debugPrint('Photo error: $e');
    }
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

  Future<void> _submitIncident() async {
    if (_descriptionController.text.trim().isEmpty) {
      _showSnack('Please enter a description', Colors.black87);
      return;
    }

    setState(() => _isSubmitting = true);

    final clientIncidentId = const Uuid().v4();
    final prefs = await SharedPreferences.getInstance();
    final token =
        prefs.getString('access_token') ?? prefs.getString('token') ?? '';

    final payload = <String, dynamic>{
      'client_incident_id': clientIncidentId,
      'description': _descriptionController.text.trim(),
      'priority': _selectedPriority,
      'photo_url': _photoBase64 ?? '',
      'reported_at': DateTime.now().toIso8601String(),
    };

    // Is the phone connected to anything at all?
    final connectivity = await Connectivity().checkConnectivity();
    final deviceOffline = connectivity.every((r) => r == ConnectivityResult.none);

    if (deviceOffline) {
      await _queueAndFinish(
        clientIncidentId,
        payload,
        toast: 'No internet. Incident saved and will sync automatically.',
        p1Reason: 'You are offline and this P1 incident cannot be sent instantly.',
      );
      return;
    }

    // LIVE UPLOAD
    final outcome = await ApiClient.postJson(
      ApiConfig.incidentsUrl,
      token: token,
      body: payload,
      timeout: const Duration(seconds: 30), // photos can be large
    );

    if (outcome.ok) {
      _showSnack('Incident reported successfully.', Colors.green);
      if (mounted) Navigator.pop(context);
      return;
    }

    debugPrint('Incident upload failed: ${outcome.failure} ${outcome.describe}');

    switch (outcome.failure) {
      case ApiFailure.network:
        await _queueAndFinish(
          clientIncidentId,
          payload,
          toast: 'Could not reach the server (${outcome.message}). '
              'Incident saved and will sync automatically.',
          p1Reason: 'The server could not be reached for this P1 incident.',
        );
        break;

      case ApiFailure.unauthorized:
        await _queueAndFinish(
          clientIncidentId,
          payload,
          toast: 'Session expired (HTTP 401). Incident saved - please log out '
              'and log in again so it can sync.',
          p1Reason: 'Your login expired, so this P1 incident was not sent.',
        );
        break;

      case ApiFailure.server:
        await _queueAndFinish(
          clientIncidentId,
          payload,
          toast: 'Server problem (${outcome.describe}). '
              'Incident saved and will retry automatically.',
          p1Reason: 'The server had an error while receiving this P1 incident.',
        );
        break;

      case ApiFailure.rejected:
      case ApiFailure.none:
        // The server refused this data. Queueing would fail forever, so keep
        // the form open and show the REAL reason.
        _showSnack(
          'Server rejected the report (${outcome.describe})',
          Colors.red.shade700,
          seconds: 8,
        );
        if (mounted) setState(() => _isSubmitting = false);
        break;
    }
  }

  /// Saves the incident in the local queue, triggers a sync attempt, then
  /// closes the screen (P1 shows the emergency modal first).
  Future<void> _queueAndFinish(
    String clientIncidentId,
    Map<String, dynamic> payload, {
    required String toast,
    required String p1Reason,
  }) async {
    await LocalDbService().queueIncident(clientIncidentId, payload);
    SyncService().initialize(); // safe to call repeatedly

    if (!mounted) return;

    if (_selectedPriority == 'P1') {
      await _showP1EmergencyModal(p1Reason);
    } else {
      _showSnack(toast, Colors.orange.shade800, seconds: 6);
      if (mounted) Navigator.pop(context);
    }
  }

  Future<void> _showP1EmergencyModal(String reason) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: Colors.red.shade700,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.white, size: 32),
              SizedBox(width: 12),
              Text('CRITICAL ALERT',
                  style: TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          content: Text(
            '$reason\n\nThe report is saved and will upload automatically. '
            'Call the Control Room immediately via radio or phone.',
            style: const TextStyle(color: Colors.white, fontSize: 16),
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.red.shade700,
              ),
              onPressed: () {
                Navigator.of(dialogContext).pop(); // close dialog
                if (mounted) Navigator.of(context).pop(); // close screen
              },
              child: const Text('I Understand',
                  style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Report Incident'),
        backgroundColor: const Color(0xFFDC2626),
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Priority Level',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(12),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedPriority,
                  isExpanded: true,
                  items: _priorityLabels.entries.map((entry) {
                    return DropdownMenuItem(
                      value: entry.key,
                      child: Text(
                        entry.value,
                        style: TextStyle(
                          color: entry.key == 'P1'
                              ? Colors.red
                              : entry.key == 'P2'
                                  ? Colors.orange
                                  : Colors.black87,
                          fontWeight: entry.key == 'P1' || entry.key == 'P2'
                              ? FontWeight.bold
                              : FontWeight.normal,
                        ),
                      ),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value != null) setState(() => _selectedPriority = value);
                  },
                ),
              ),
            ),
            const SizedBox(height: 24),
            const Text('Description',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            TextField(
              controller: _descriptionController,
              maxLines: 5,
              decoration: InputDecoration(
                hintText: 'Describe the issue...',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Camera button
            InkWell(
              onTap: _capturePhoto,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                height: 120,
                decoration: BoxDecoration(
                  color: _photoBase64 != null
                      ? Colors.green.shade50
                      : Colors.grey.shade200,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _photoBase64 != null
                        ? Colors.green.shade400
                        : Colors.grey.shade300,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      _photoBase64 != null
                          ? Icons.check_circle
                          : Icons.camera_alt,
                      size: 40,
                      color:
                          _photoBase64 != null ? Colors.green : Colors.black38,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _photoBase64 != null
                          ? 'Photo Captured (Tap to retake)'
                          : 'Tap to add photo (Optional)',
                      style: TextStyle(
                        color: _photoBase64 != null
                            ? Colors.green.shade700
                            : Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),

            ElevatedButton(
              onPressed: _isSubmitting ? null : _submitIncident,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: _isSubmitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2),
                    )
                  : const Text('Submit Report',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}
