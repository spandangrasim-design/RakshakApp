import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:uuid/uuid.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;

import '../services/local_db_service.dart';
import '../services/sync_service.dart'; // Added to trigger background sync
import 'locked_camera_screen.dart'; // For API_BASE_URL

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
        imageQuality: 60, // Compress to save bandwidth
        maxWidth: 1080,
      );

      if (photo != null) {
        final bytes = await photo.readAsBytes();
        setState(() {
          _photoBase64 = "data:image/jpeg;base64,${base64Encode(bytes)}";
        });
      }
    } catch (e) {
      debugPrint("Photo error: $e");
    }
  }

  Future<void> _submitIncident() async {
    if (_descriptionController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a description')),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final connectivityResult = await Connectivity().checkConnectivity();
    final isOffline = !connectivityResult.contains(ConnectivityResult.mobile) && 
                      !connectivityResult.contains(ConnectivityResult.wifi);

    final clientIncidentId = const Uuid().v4();
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token') ?? '';

    final payload = {
      "client_incident_id": clientIncidentId,
      "description": _descriptionController.text.trim(),
      "priority": _selectedPriority,
      "photo_url": _photoBase64 ?? "", // Matches Cloudflare Worker expectation
      "reported_at": DateTime.now().toIso8601String()
    };

    if (isOffline) {
      // 1. OFFLINE QUEUE
      await LocalDbService().queueIncident(clientIncidentId, payload);
      SyncService().initialize(); // Ensure sync listener is active
      
      if (_selectedPriority == 'P1') {
        _showP1EmergencyModal();
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offline: Incident queued for sync.'), backgroundColor: Colors.orange),
        );
        Navigator.pop(context);
      }
    } else {
      // 2. LIVE UPLOAD
      try {
        final response = await http.post(
          Uri.parse('${LockedCameraScreen.API_BASE_URL}/api/v1/incidents'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode(payload),
        ).timeout(const Duration(seconds: 15));

        if (response.statusCode == 200 || response.statusCode == 201) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Incident reported successfully.'), backgroundColor: Colors.green),
          );
          Navigator.pop(context);
        } else {
          throw Exception('Server error: ${response.statusCode}');
        }
      } catch (e) {
        debugPrint('Upload failed, queuing offline: $e');
        await LocalDbService().queueIncident(clientIncidentId, payload);
        SyncService().initialize(); // Ensure sync listener is active
        
        if (_selectedPriority == 'P1') {
          _showP1EmergencyModal();
        } else {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Network unstable. Incident queued.'), backgroundColor: Colors.orange),
          );
          Navigator.pop(context);
        }
      }
    }

    if (mounted) setState(() => _isSubmitting = false);
  }

  void _showP1EmergencyModal() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: Colors.red.shade700,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.white, size: 32),
              SizedBox(width: 12),
              Text('CRITICAL ALERT', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          content: const Text(
            'You are offline and this P1 incident cannot be transmitted instantly.\n\nCall the Control Room immediately via radio or phone.',
            style: TextStyle(color: Colors.white, fontSize: 16),
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.red.shade700,
              ),
              onPressed: () {
                Navigator.of(context).pop(); 
                Navigator.of(context).pop(); 
              },
              child: const Text('I Understand', style: TextStyle(fontWeight: FontWeight.bold)),
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
            const Text('Priority Level', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
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
                      child: Text(entry.value, 
                        style: TextStyle(
                          color: entry.key == 'P1' ? Colors.red : 
                                 entry.key == 'P2' ? Colors.orange : Colors.black87,
                          fontWeight: entry.key == 'P1' || entry.key == 'P2' ? FontWeight.bold : FontWeight.normal
                        )
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
            
            const Text('Description', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
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

            // Camera Button
            InkWell(
              onTap: _capturePhoto,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                height: 120,
                decoration: BoxDecoration(
                  color: _photoBase64 != null ? Colors.green.shade50 : Colors.grey.shade200,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _photoBase64 != null ? Colors.green.shade400 : Colors.grey.shade300, 
                    style: BorderStyle.solid
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      _photoBase64 != null ? Icons.check_circle : Icons.camera_alt, 
                      size: 40, 
                      color: _photoBase64 != null ? Colors.green : Colors.black38
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _photoBase64 != null ? 'Photo Captured (Tap to retake)' : 'Tap to add photo (Optional)', 
                      style: TextStyle(color: _photoBase64 != null ? Colors.green.shade700 : Colors.black54)
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
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _isSubmitting 
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Submit Report', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}