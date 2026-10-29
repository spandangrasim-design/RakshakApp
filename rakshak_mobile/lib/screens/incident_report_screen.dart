import 'dart:convert';
import 'dart:typed_data';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/token_store.dart';
import 'package:uuid/uuid.dart';

import '../config/api_config.dart';
import '../services/api_client.dart';
import '../services/incident_service.dart';
import '../services/local_db_service.dart';
import '../services/sync_service.dart';

class IncidentReportScreen extends StatefulWidget {
  const IncidentReportScreen({super.key});

  @override
  State<IncidentReportScreen> createState() => _IncidentReportScreenState();
}

class _IncidentReportScreenState extends State<IncidentReportScreen> {
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();

  String _selectedCategory = 'Security / Patrol';
  String _selectedPriority = 'P3';
  String _selectedGroup = 'Security Operations L1';
  List<String> _availableGroups = IncidentService.defaultGroups;
  bool _isSubmitting = false;

  // Ordered list of form fields this user is entitled to (server-resolved: plant licence AND admin allocation).
  // A field not in this list is not built at all, and the numbers below are 1..n with no gaps.
  List<String> _fields = [];
  bool _has(String id) => _fields.contains(id);
  int _n(String id) => _fields.indexOf(id) + 1;

  Future<void> _loadFields() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('incident_form_fields');
    var list = <String>[];
    if (raw != null && raw.isNotEmpty) {
      try {
        list = (jsonDecode(raw) as List).map((e) => e.toString()).toList();
      } catch (_) {}
    }
    if (!mounted) return;
    setState(() => _fields = list);
  }

  String? _photoBase64;
  Uint8List? _photoBytes;
  final ImagePicker _picker = ImagePicker();

  final List<String> _categories = [
    'Security / Patrol',
    'Asset Breach',
    'Fire / Hazard',
    'Access Control',
  ];

  final List<String> _quickTemplates = [
    'Unauthorized Perimeter Entry',
    'Gate Access Control Issue',
    'Fire / Smoke Hazard Detected',
    'Damaged Fencing / Lock',
    'CCTV / Lighting Outage',
  ];

  final List<Map<String, dynamic>> _priorityOptions = [
    {
      'code': 'P1',
      'title': 'P1 - Critical',
      'sub': 'Intruder, Fire, Medical',
      'impact': '1 - High',
      'urgency': '1 - High',
      'color': const Color(0xFFDC2626),
    },
    {
      'code': 'P2',
      'title': 'P2 - High',
      'sub': 'Breach, Vandalism',
      'impact': '1 - High',
      'urgency': '2 - Medium',
      'color': const Color(0xFFEA580C),
    },
    {
      'code': 'P3',
      'title': 'P3 - Moderate',
      'sub': 'Suspicious Activity',
      'impact': '2 - Medium',
      'urgency': '2 - Medium',
      'color': const Color(0xFF2563EB),
    },
    {
      'code': 'P4',
      'title': 'P4 - Low',
      'sub': 'Maintenance / Light',
      'impact': '3 - Low',
      'urgency': '3 - Low',
      'color': const Color(0xFF475569),
    },
  ];

  @override
  void initState() {
    super.initState();
    _loadFields();
    _loadGroups();
  }

  Future<void> _loadGroups() async {
    final groups = await IncidentService.fetchAssignmentGroups();
    if (!mounted) return;
    setState(() {
      _availableGroups = groups;
      if (!_availableGroups.contains(_selectedGroup) &&
          _availableGroups.isNotEmpty) {
        _selectedGroup = _availableGroups.first;
      }
    });
  }

  Future<void> _capturePhoto() async {
    try {
      final XFile? photo = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 55,
        maxWidth: 1024,
      );

      if (photo != null) {
        final bytes = await photo.readAsBytes();
        if (!mounted) return;
        setState(() {
          _photoBytes = bytes;
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
    final titleText = _titleController.text.trim();
    final descText = _descriptionController.text.trim();

    final hasTextField = _has('title') || _has('description');
    if (hasTextField && titleText.isEmpty && descText.isEmpty) {
      _showSnack('Please enter a title or description for the incident.',
          Colors.black87);
      return;
    }

    setState(() => _isSubmitting = true);

    final clientIncidentId = const Uuid().v4();
    final prefs = await SharedPreferences.getInstance();
    final token =
        await TokenStore.read();
    final guardId = prefs.getString('guard_id') ?? '';

    final selectedMeta = _priorityOptions.firstWhere(
      (p) => p['code'] == _selectedPriority,
      orElse: () => _priorityOptions[2],
    );

    final finalTitle = titleText.isNotEmpty
        ? titleText
        : (descText.length > 40 ? descText.substring(0, 40) : descText);
    final finalDescription = descText.isNotEmpty
        ? (titleText.isNotEmpty ? '$titleText — $descText' : descText)
        : titleText;

    final payload = <String, dynamic>{
      'client_incident_id': clientIncidentId,
      'guard_id': guardId.isNotEmpty ? guardId : null,
      'title': finalTitle,
      'description': finalDescription,
      'category': _selectedCategory,
      'priority': _selectedPriority,
      'impact': selectedMeta['impact'],
      'urgency': selectedMeta['urgency'],
      'assignment_group': _selectedGroup,
      'photo_url': _photoBase64 ?? '',
      'reported_at': DateTime.now().toIso8601String(),
    };

    final connectivity = await Connectivity().checkConnectivity();
    final deviceOffline =
        connectivity.every((r) => r == ConnectivityResult.none);

    if (deviceOffline) {
      await _queueAndFinish(
        clientIncidentId,
        payload,
        toast: 'No internet. Incident saved and will sync automatically.',
        p1Reason:
            'You are offline and this P1 incident cannot be sent instantly.',
      );
      return;
    }

    final outcome = await ApiClient.postJson(
      ApiConfig.incidentsUrl,
      token: token,
      body: payload,
      timeout: const Duration(seconds: 30),
    );

    if (outcome.ok) {
      _showSnack(
        'Incident dispatched to $_selectedGroup!',
        Colors.green.shade700,
      );
      if (mounted) Navigator.pop(context, true);
      return;
    }

    switch (outcome.failure) {
      case ApiFailure.network:
        await _queueAndFinish(
          clientIncidentId,
          payload,
          toast: 'Could not reach server. Saved to offline sync queue.',
          p1Reason: 'The server could not be reached for this P1 incident.',
        );
        break;
      case ApiFailure.unauthorized:
        await _queueAndFinish(
          clientIncidentId,
          payload,
          toast: 'Session expired (HTTP 401). Saved offline.',
          p1Reason: 'Your login expired, so this P1 incident was not sent.',
        );
        break;
      case ApiFailure.server:
        await _queueAndFinish(
          clientIncidentId,
          payload,
          toast: 'Server error. Saved to offline sync queue.',
          p1Reason: 'The server had an error while receiving this P1 incident.',
        );
        break;
      case ApiFailure.rejected:
      case ApiFailure.none:
        _showSnack(
          'Server rejected the report (${outcome.describe})',
          Colors.red.shade700,
          seconds: 8,
        );
        if (mounted) setState(() => _isSubmitting = false);
        break;
    }
  }

  Future<void> _queueAndFinish(
    String clientIncidentId,
    Map<String, dynamic> payload, {
    required String toast,
    required String p1Reason,
  }) async {
    await LocalDbService().queueIncident(clientIncidentId, payload);
    SyncService().initialize();

    if (!mounted) return;

    if (_selectedPriority == 'P1') {
      await _showP1EmergencyModal(p1Reason);
    } else {
      _showSnack(toast, Colors.orange.shade800, seconds: 6);
      if (mounted) Navigator.pop(context, true);
    }
  }

  Future<void> _showP1EmergencyModal(String reason) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: Colors.red.shade700,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
                Navigator.of(dialogContext).pop();
                if (mounted) Navigator.of(context).pop(true);
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
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text(
          'Report Security Incident',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_has('severity')) ...[
            // 1. Severity Level Grid
            Text(
              '${_n('severity')}. Select Severity Level',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 14,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 10),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _priorityOptions.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 2.25,
              ),
              itemBuilder: (context, index) {
                final item = _priorityOptions[index];
                final isSelected = _selectedPriority == item['code'];
                final color = item['color'] as Color;

                return InkWell(
                  onTap: () =>
                      setState(() => _selectedPriority = item['code'] as String),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? color.withValues(alpha: 0.1)
                          : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? color : const Color(0xFFE2E8F0),
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: color,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              item['title'] as String,
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                                color: isSelected
                                    ? color
                                    : const Color(0xFF0F172A),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          item['sub'] as String,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 20),

            ],
            if (_has('category')) ...[
            // 2. Category & Response Group Routing
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
              '${_n('category')}. Category',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: const Color(0xFFCBD5E1)),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _selectedCategory,
                            isExpanded: true,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF0F172A),
                            ),
                            items: _categories
                                .map((c) => DropdownMenuItem(
                                      value: c,
                                      child: Text(c,
                                          overflow: TextOverflow.ellipsis),
                                    ))
                                .toList(),
                            onChanged: (v) {
                              if (v != null) {
                                setState(() => _selectedCategory = v);
                              }
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            ],
            if (_has('group')) ...[
            Text(
              '${_n('group')}. Dispatch Assignment Group (Auto-Emails Unit)',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 13,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                border: Border.all(color: const Color(0xFF93C5FD)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedGroup,
                  isExpanded: true,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1E3A8A),
                  ),
                  items: _availableGroups
                      .map((g) => DropdownMenuItem(
                            value: g,
                            child: Text(g, overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _selectedGroup = v);
                  },
                ),
              ),
            ),
            const SizedBox(height: 20),

            ],
            if (_has('title')) ...[
            // 4. Quick Incident Title + Templates
            Text(
              '${_n('title')}. Incident Title / Summary',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 14,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _quickTemplates.map((tpl) {
                  final active = _titleController.text == tpl;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8.0),
                    child: ActionChip(
                      backgroundColor: active
                          ? const Color(0xFF1E3A8A)
                          : Colors.white,
                      side: BorderSide(
                        color: active
                            ? const Color(0xFF1E3A8A)
                            : const Color(0xFFCBD5E1),
                      ),
                      label: Text(
                        tpl,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: active
                              ? Colors.white
                              : const Color(0xFF334155),
                        ),
                      ),
                      onPressed: () {
                        setState(() {
                          _titleController.text = tpl;
                        });
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                hintText: 'Short summary (e.g. Gate 2 Lock Broken)',
                filled: true,
                fillColor: Colors.white,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
                ),
              ),
            ),
            const SizedBox(height: 16),

            ],
            if (_has('description')) ...[
            Text(
              '${_n('description')}. Detailed Observations & Location',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 14,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _descriptionController,
              maxLines: 4,
              decoration: InputDecoration(
                hintText:
                    'Provide exact gate/plant zone, observations, and immediate action taken...',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
                ),
              ),
            ),
            const SizedBox(height: 20),

            ],
            if (_has('photo')) ...[
            // 6. Camera Evidence Preview
            Text(
              '${_n('photo')}. Field Photo Evidence',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 14,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 8),
            if (_photoBytes != null)
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFF10B981), width: 1.5),
                ),
                child: Column(
                  children: [
                    ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(12)),
                      child: Image.memory(
                        _photoBytes!,
                        height: 170,
                        width: double.infinity,
                        fit: BoxFit.cover,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.check_circle,
                                  color: Color(0xFF059669), size: 18),
                              SizedBox(width: 6),
                              Text(
                                'Evidence Photo Attached',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  color: Color(0xFF059669),
                                ),
                              ),
                            ],
                          ),
                          TextButton.icon(
                            onPressed: _capturePhoto,
                            icon: const Icon(Icons.camera_alt_outlined,
                                size: 16),
                            label: const Text('Retake'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              )
            else
              InkWell(
                onTap: _capturePhoto,
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  height: 110,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFCBD5E1)),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_a_photo_outlined,
                          size: 32, color: Color(0xFF2563EB)),
                      SizedBox(height: 8),
                      Text(
                        'Tap to Capture Evidence Photo',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 28),

            ElevatedButton.icon(
              onPressed: _isSubmitting ? null : _submitIncident,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              icon: _isSubmitting
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2),
                    )
                  : const Icon(Icons.send_rounded, size: 18),
              label: Text(
                _isSubmitting
                    ? 'Dispatching Incident...'
                    : 'Submit & Dispatch Incident',
                style:
                    const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}