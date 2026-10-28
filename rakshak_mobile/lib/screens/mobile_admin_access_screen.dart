import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';

/// Admin tool: choose which features each staff member gets.
///
/// Only features the organization has purchased are listed (the server sends
/// `licensed_permission_keys`). Anything not purchased is simply not rendered.
class MobileAdminAccessScreen extends StatefulWidget {
  final String token;

  const MobileAdminAccessScreen({super.key, required this.token});

  @override
  State<MobileAdminAccessScreen> createState() =>
      _MobileAdminAccessScreenState();
}

class _MobileAdminAccessScreenState extends State<MobileAdminAccessScreen> {
  static const _homeFeatures = <String, String>{
    'patrol_route': 'Patrol Route',
    'report_incident': 'Report Incident',
    'incident_tickets': 'Incident Tickets',
    'activity_log': 'Activity Log',
    'sync_queue': 'Sync Queue',
  };

  // Canonical order. Numbered 1..n over whatever the organization bought.
  static const _incidentOptions = <String, String>{
    'incident_option_1_severity': 'Severity level',
    'incident_option_2_category': 'Category',
    'incident_option_3_group': 'Assignment group',
    'incident_option_4_title': 'Title',
    'incident_option_5_description': 'Description',
    'incident_option_6_photo': 'Camera photo',
  };

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _guards = [];
  Set<String> _licensed = {};

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.token}',
      };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await http
          .get(Uri.parse('${ApiConfig.apiBase}/guards'), headers: _headers)
          .timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) {
        throw Exception('Server returned ${res.statusCode}');
      }
      final data = jsonDecode(res.body);
      final list = (data['guards'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      final licensed = (data['licensed_permission_keys'] as List? ?? [])
          .map((e) => e.toString())
          .toSet();
      if (!mounted) return;
      setState(() {
        _guards = list;
        _licensed = licensed;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load staff. $e';
        _loading = false;
      });
    }
  }

  Future<bool> _save(String guardId, Map<String, bool> perms) async {
    try {
      final res = await http
          .patch(
            Uri.parse('${ApiConfig.apiBase}/access-control/guards/$guardId'),
            headers: _headers,
            body: jsonEncode({'overrides': perms}),
          )
          .timeout(const Duration(seconds: 20));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  void _openEditor(Map<String, dynamic> guard) {
    final current = Map<String, dynamic>.from(
        (guard['app_permissions'] as Map?) ?? const {});
    // Start from what the user effectively has; ignore anything not purchased.
    final draft = <String, bool>{
      for (final k in [..._homeFeatures.keys, ..._incidentOptions.keys])
        if (_licensed.contains(k)) k: current[k] == true,
    };

    final homeKeys = _homeFeatures.keys.where(_licensed.contains).toList();
    final optionKeys = _incidentOptions.keys.where(_licensed.contains).toList();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        bool saving = false;
        return StatefulBuilder(
          builder: (context, setSheet) {
            Widget switchTile(String key, String label) => SwitchListTile(
                  dense: true,
                  title: Text(label),
                  value: draft[key] ?? false,
                  onChanged: (v) => setSheet(() => draft[key] = v),
                );

            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(context).viewInsets.bottom,
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.of(context).size.height * 0.85,
                  ),
                  child: ListView(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    children: [
                      Text(
                        guard['full_name']?.toString() ?? 'Staff',
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        guard['employee_code']?.toString() ?? '',
                        style: const TextStyle(color: Colors.black54),
                      ),
                      const SizedBox(height: 12),
                      if (homeKeys.isEmpty && optionKeys.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Text(
                              'No features are enabled for your organization yet.'),
                        ),
                      if (homeKeys.isNotEmpty) ...[
                        const Text('Home screen',
                            style: TextStyle(fontWeight: FontWeight.w700)),
                        for (final k in homeKeys)
                          switchTile(k, _homeFeatures[k]!),
                        const SizedBox(height: 8),
                      ],
                      if (optionKeys.isNotEmpty) ...[
                        const Text('Incident form fields',
                            style: TextStyle(fontWeight: FontWeight.w700)),
                        for (var i = 0; i < optionKeys.length; i++)
                          switchTile(optionKeys[i],
                              'Option ${i + 1}: ${_incidentOptions[optionKeys[i]]}'),
                      ],
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: saving
                            ? null
                            : () async {
                                setSheet(() => saving = true);
                                final ok = await _save(
                                    guard['guard_id'].toString(), draft);
                                if (!mounted) return;
                                if (ok) {
                                  Navigator.of(sheetContext).pop();
                                  ScaffoldMessenger.of(this.context)
                                      .showSnackBar(const SnackBar(
                                          content: Text('Access updated')));
                                  _load();
                                } else {
                                  setSheet(() => saving = false);
                                  ScaffoldMessenger.of(this.context)
                                      .showSnackBar(const SnackBar(
                                          content:
                                              Text('Could not save changes')));
                                }
                              },
                        child: Text(saving ? 'Saving…' : 'Save'),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff Access Control'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, textAlign: TextAlign.center),
                  ),
                )
              : _guards.isEmpty
                  ? const Center(child: Text('No staff found.'))
                  : ListView.separated(
                      itemCount: _guards.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (_, i) {
                        final g = _guards[i];
                        return ListTile(
                          leading: const CircleAvatar(
                              child: Icon(Icons.person_outline)),
                          title: Text(g['full_name']?.toString() ?? '-'),
                          subtitle: Text(
                              '${g['employee_code'] ?? ''} · ${g['role'] ?? 'Guard'}'),
                          trailing: const Icon(Icons.tune),
                          onTap: () => _openEditor(g),
                        );
                      },
                    ),
    );
  }
}
