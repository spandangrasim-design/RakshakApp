import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../api.dart';
import '../session.dart';
import '../util.dart';

/// Shows only the fields this guard is allowed to fill, numbered 1..n with no gaps.
class IncidentScreen extends StatefulWidget {
  final String checkpointName;

  const IncidentScreen({super.key, required this.checkpointName});

  @override
  State<IncidentScreen> createState() => _IncidentScreenState();
}

class _IncidentScreenState extends State<IncidentScreen> {
  static const _priorities = <String, String>{
    'P1': 'P1 - Critical',
    'P2': 'P2 - High',
    'P3': 'P3 - Moderate',
    'P4': 'P4 - Low',
  };
  static const _categories = <String>[
    'Security / Patrol',
    'Safety Hazard',
    'Fire',
    'Medical',
    'Theft / Intrusion',
    'Equipment Fault',
    'Other',
  ];

  final _title = TextEditingController();
  final _desc = TextEditingController();
  String _priority = 'P3';
  String _category = 'Security / Patrol';
  Uint8List? _photo;
  bool _sending = false;

  // 'group' is chosen by the server (default queue); the guard never sees it.
  late final List<String> _fields = Session.formFields.where((f) => f != 'group').toList();

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _takePhoto() async {
    try {
      final shot = await ImagePicker().pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.rear,
        maxWidth: 1280,
        maxHeight: 1280,
        imageQuality: 70,
      );
      if (shot == null) return;
      final bytes = await shot.readAsBytes();
      if (!mounted) return;
      setState(() => _photo = bytes);
    } catch (_) {
      _toast('Could not open the camera.');
    }
  }

  Future<void> _submit() async {
    final hasText = _fields.contains('title') || _fields.contains('description');
    if (hasText && _title.text.trim().isEmpty && _desc.text.trim().isEmpty) {
      _toast('Please describe what you saw.');
      return;
    }

    final payload = <String, dynamic>{
      'client_incident_id': const Uuid().v4(),
      'reported_at': DateTime.now().toUtc().toIso8601String(),
    };
    if (_fields.contains('severity')) payload['priority'] = _priority;
    if (_fields.contains('category')) payload['category'] = _category;
    if (_fields.contains('title') && _title.text.trim().isNotEmpty) {
      payload['title'] = _title.text.trim();
    }
    if (_fields.contains('description')) {
      final text = _desc.text.trim().isNotEmpty ? _desc.text.trim() : _title.text.trim();
      payload['description'] = '[${widget.checkpointName}] $text';
    }
    if (_fields.contains('photo') && _photo != null) {
      payload['photo_url'] = base64Encode(_photo!);
    }

    setState(() => _sending = true);
    try {
      await Api.createIncident(payload);
      if (!mounted) return;
      _toast('Incident reported');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[
      Text('At: ${widget.checkpointName}', style: const TextStyle(color: Colors.black54)),
      const SizedBox(height: 16),
    ];

    for (var i = 0; i < _fields.length; i++) {
      switch (_fields[i]) {
        case 'severity':
          children.add(DropdownButtonFormField<String>(
            value: _priority,
            decoration: InputDecoration(labelText: numbered(i, 'Severity'), border: const OutlineInputBorder()),
            items: [for (final e in _priorities.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _priority = v ?? 'P3'),
          ));
          break;
        case 'category':
          children.add(DropdownButtonFormField<String>(
            value: _category,
            decoration: InputDecoration(labelText: numbered(i, 'Category'), border: const OutlineInputBorder()),
            items: [for (final c in _categories) DropdownMenuItem(value: c, child: Text(c))],
            onChanged: (v) => setState(() => _category = v ?? _category),
          ));
          break;
        case 'title':
          children.add(TextField(
            controller: _title,
            decoration: InputDecoration(labelText: numbered(i, 'Short title'), border: const OutlineInputBorder()),
          ));
          break;
        case 'description':
          children.add(TextField(
            controller: _desc,
            maxLines: 4,
            decoration: InputDecoration(labelText: numbered(i, 'What happened?'), border: const OutlineInputBorder()),
          ));
          break;
        case 'photo':
          children.add(Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(numbered(i, 'Photo'), style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              if (_photo != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.memory(_photo!, height: 180, width: double.infinity, fit: BoxFit.cover),
                ),
              OutlinedButton.icon(
                onPressed: _sending ? null : _takePhoto,
                icon: const Icon(Icons.photo_camera_outlined),
                label: Text(_photo == null ? 'Take photo' : 'Retake photo'),
              ),
            ],
          ));
          break;
      }
      children.add(const SizedBox(height: 16));
    }

    children.add(FilledButton(
      onPressed: _sending ? null : _submit,
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
      child: _sending
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
            )
          : const Text('Submit incident', style: TextStyle(fontSize: 16)),
    ));

    return Scaffold(
      appBar: AppBar(title: const Text('Report incident')),
      body: ListView(padding: const EdgeInsets.all(16), children: children),
    );
  }
}
