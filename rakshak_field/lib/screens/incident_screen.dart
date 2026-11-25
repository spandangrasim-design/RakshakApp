import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../api.dart';
import '../session.dart';
import '../util.dart';
import 'camera_capture_screen.dart';

/// Shows only the fields this guard is allowed to fill, numbered 1..n with no gaps.
class IncidentScreen extends StatefulWidget {
  final String? checkpointName;

  const IncidentScreen({super.key, this.checkpointName});

  @override
  State<IncidentScreen> createState() => _IncidentScreenState();
}

class _IncidentScreenState extends State<IncidentScreen> {
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
  final _location = TextEditingController();
  late String _plantName = Api.plants.isNotEmpty ? Api.plants.first : 'Test - P1';
  String _category = 'Security / Patrol';
  Uint8List? _photo;
  bool _sending = false;

  // 'group' is chosen by the server (default queue); 'severity' is replaced by Plant Name.
  late final List<String> _fields =
      Session.formFields.where((f) => f != 'group' && f != 'severity').toList();

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    _location.dispose();
    super.dispose();
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _takePhoto() async {
    final bytes = await captureImage(context, title: 'Photo of the incident', startFront: false);
    if (bytes == null || !mounted) return;
    setState(() => _photo = bytes);
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
      'plant_name': _plantName,
    };
    if (_fields.contains('category')) payload['category'] = _category;
    if (_fields.contains('title') && _title.text.trim().isNotEmpty) {
      payload['title'] = _title.text.trim();
    }
    if (_fields.contains('description')) {
      final text = _desc.text.trim().isNotEmpty ? _desc.text.trim() : _title.text.trim();
      final loc = (widget.checkpointName != null && widget.checkpointName!.trim().isNotEmpty)
          ? widget.checkpointName!.trim()
          : _location.text.trim();
      payload['description'] = loc.isNotEmpty ? '[$loc] $text' : text;
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
    final plants = Api.plants.isNotEmpty ? Api.plants : const ['Test - P1', 'Test2 - P2'];
    final selectedPlant = plants.contains(_plantName) ? _plantName : plants.first;

    final children = <Widget>[
      if (widget.checkpointName != null && widget.checkpointName!.isNotEmpty) ...[
        Text('At: ${widget.checkpointName}', style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 16),
      ],
      DropdownButtonFormField<String>(
        value: selectedPlant,
        decoration: const InputDecoration(
          labelText: '1. Plant Name',
          border: OutlineInputBorder(),
        ),
        items: [for (final p in plants) DropdownMenuItem(value: p, child: Text(p))],
        onChanged: (v) => setState(() => _plantName = v ?? selectedPlant),
      ),
      const SizedBox(height: 16),
    ];

    for (var i = 0; i < _fields.length; i++) {
      final stepIdx = i + 1;
      switch (_fields[i]) {
        case 'category':
          children.add(DropdownButtonFormField<String>(
            value: _category,
            decoration: InputDecoration(labelText: numbered(stepIdx, 'Category'), border: const OutlineInputBorder()),
            items: [for (final c in _categories) DropdownMenuItem(value: c, child: Text(c))],
            onChanged: (v) => setState(() => _category = v ?? _category),
          ));
          break;
        case 'title':
          children.add(TextField(
            controller: _title,
            decoration: InputDecoration(labelText: numbered(stepIdx, 'Short title'), border: const OutlineInputBorder()),
          ));
          break;
        case 'description':
          children.add(TextField(
            controller: _desc,
            maxLines: 4,
            decoration: InputDecoration(labelText: numbered(stepIdx, 'What happened?'), border: const OutlineInputBorder()),
          ));
          break;
        case 'photo':
          children.add(Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(numbered(stepIdx, 'Photo'), style: const TextStyle(fontWeight: FontWeight.w600)),
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
      appBar: AppBar(
        title: Text(
          widget.checkpointName != null && widget.checkpointName!.isNotEmpty
              ? 'Report incident · ${widget.checkpointName}'
              : 'Report incident',
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: children),
    );
  }
}