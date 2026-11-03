import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../api.dart';
import 'camera_capture_screen.dart';
import 'routes_screen.dart';

/// First launch only: pick the industry, enter the site code, name and number, take a selfie.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _code = TextEditingController();

  List<Map<String, dynamic>> _industries = [];
  String? _tenantId;
  Uint8List? _selfie;

  bool _loading = true;
  bool _submitting = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _loadIndustries();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _loadIndustries() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final list = await Api.industries();
      if (!mounted) return;
      setState(() {
        _industries = list;
        _tenantId = list.length == 1 ? list.first['id'].toString() : _tenantId;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _takeSelfie() async {
    final bytes = await captureImage(context, title: 'Take your selfie', startFront: true);
    if (bytes == null || !mounted) return;
    setState(() => _selfie = bytes);
  }

  void _toast(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _join() async {
    final name = _name.text.trim();
    final phone = _phone.text.trim();
    final code = _code.text.trim();

    if (_tenantId == null) return _toast('Please choose your industry.');
    if (code.length < 4) return _toast('Enter the site code given by your supervisor.');
    if (name.length < 2) return _toast('Please enter your name.');
    if (phone.replaceAll(RegExp(r'[^0-9]'), '').length < 8) return _toast('Please enter a valid mobile number.');
    if (_selfie == null) return _toast('Please take a selfie.');

    setState(() => _submitting = true);
    try {
      await Api.register(
        tenantId: _tenantId!,
        joinCode: code,
        fullName: name,
        phone: phone,
        selfieBase64: base64Encode(_selfie!),
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const RoutesScreen()),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const SizedBox(height: 8),
                  const Icon(Icons.shield_outlined, size: 48, color: Color(0xFF2563EB)),
                  const SizedBox(height: 8),
                  const Text('Rakshak Field',
                      style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  const Text('Tell us who you are once. No password needed.',
                      style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 24),
                  if (_loadError != null) ...[
                    Text(_loadError!, style: const TextStyle(color: Colors.red)),
                    const SizedBox(height: 8),
                    OutlinedButton(onPressed: _loadIndustries, child: const Text('Try again')),
                  ] else if (_industries.isEmpty) ...[
                    const Text(
                      'No industry is accepting field guards yet. Ask your administrator to switch on the Field app.',
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(onPressed: _loadIndustries, child: const Text('Refresh')),
                  ] else ...[
                    DropdownButtonFormField<String>(
                      value: _tenantId,
                      decoration: const InputDecoration(labelText: 'Industry', border: OutlineInputBorder()),
                      items: [
                        for (final t in _industries)
                          DropdownMenuItem(value: t['id'].toString(), child: Text(t['name'].toString())),
                      ],
                      onChanged: (v) => setState(() => _tenantId = v),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _code,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(labelText: 'Site code', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Your name', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(labelText: 'Mobile number', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Container(
                          width: 84,
                          height: 84,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(42),
                            color: Colors.grey.shade200,
                            image: _selfie == null
                                ? null
                                : DecorationImage(image: MemoryImage(_selfie!), fit: BoxFit.cover),
                          ),
                          child: _selfie == null ? const Icon(Icons.person_outline, size: 36) : null,
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _submitting ? null : _takeSelfie,
                            icon: const Icon(Icons.photo_camera_outlined),
                            label: Text(_selfie == null ? 'Take selfie' : 'Retake selfie'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _submitting ? null : _join,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                      child: _submitting
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                            )
                          : const Text('Continue', style: TextStyle(fontSize: 16)),
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}
