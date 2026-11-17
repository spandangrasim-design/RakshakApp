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
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
                children: [
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(22),
                              gradient: const LinearGradient(
                                colors: [Color(0xFF17365F), Color(0xFF245BDB)],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              ),
                              boxShadow: const [
                                BoxShadow(color: Color(0x24245BDB), blurRadius: 24, offset: Offset(0, 10)),
                              ],
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 66,
                                  height: 66,
                                  padding: const EdgeInsets.all(3),
                                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(17)),
                                  child: Image.asset('assets/branding/rakshak-logo.png', fit: BoxFit.contain),
                                ),
                                const SizedBox(width: 15),
                                const Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('Rakshak Field', style: TextStyle(fontSize: 22, color: Colors.white, fontWeight: FontWeight.w900, letterSpacing: -0.4)),
                                      SizedBox(height: 4),
                                      Text('Join your site securely', style: TextStyle(color: Color(0xFFDCE8FF), fontSize: 12, fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 22),
                          Container(
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: const Color(0xFFE5ECF4)),
                              boxShadow: const [
                                BoxShadow(color: Color(0x0D243B5B), blurRadius: 22, offset: Offset(0, 8)),
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text('Set up your access', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: Color(0xFF172B4D))),
                                const SizedBox(height: 5),
                                const Text('Complete these details once to connect this device to your site. No password is needed.', style: TextStyle(fontSize: 12, color: Color(0xFF718198), height: 1.5)),
                                const SizedBox(height: 20),
                                if (_loadError != null) ...[
                                  Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(color: const Color(0xFFFFF2F1), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF2C6C2))),
                                    child: Text(_loadError!, style: const TextStyle(color: Color(0xFFB42318), fontSize: 13)),
                                  ),
                                  const SizedBox(height: 12),
                                  OutlinedButton.icon(onPressed: _loadIndustries, icon: const Icon(Icons.refresh), label: const Text('Try again')),
                                ] else if (_industries.isEmpty) ...[
                                  const Text('No industry is accepting field guards yet. Ask your administrator to switch on the Field app.', style: TextStyle(fontSize: 13, height: 1.5, color: Color(0xFF64748B))),
                                  const SizedBox(height: 12),
                                  OutlinedButton.icon(onPressed: _loadIndustries, icon: const Icon(Icons.refresh), label: const Text('Refresh')),
                                ] else ...[
                                  DropdownButtonFormField<String>(
                                    value: _tenantId,
                                    decoration: const InputDecoration(labelText: 'Industry', prefixIcon: Icon(Icons.business_outlined)),
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
                                    decoration: const InputDecoration(labelText: 'Site code', prefixIcon: Icon(Icons.key_outlined)),
                                  ),
                                  const SizedBox(height: 14),
                                  TextField(
                                    controller: _name,
                                    textCapitalization: TextCapitalization.words,
                                    decoration: const InputDecoration(labelText: 'Your name', prefixIcon: Icon(Icons.person_outline)),
                                  ),
                                  const SizedBox(height: 14),
                                  TextField(
                                    controller: _phone,
                                    keyboardType: TextInputType.phone,
                                    decoration: const InputDecoration(labelText: 'Mobile number', prefixIcon: Icon(Icons.phone_outlined)),
                                  ),
                                  const SizedBox(height: 18),
                                  Container(
                                    padding: const EdgeInsets.all(13),
                                    decoration: BoxDecoration(color: const Color(0xFFF7F9FC), borderRadius: BorderRadius.circular(15), border: Border.all(color: const Color(0xFFE8EEF6))),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 66,
                                          height: 66,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: const Color(0xFFEAF1FF),
                                            border: Border.all(color: const Color(0xFFD7E4FA)),
                                            image: _selfie == null ? null : DecorationImage(image: MemoryImage(_selfie!), fit: BoxFit.cover),
                                          ),
                                          child: _selfie == null ? const Icon(Icons.person_outline, size: 30, color: Color(0xFF245BDB)) : null,
                                        ),
                                        const SizedBox(width: 13),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              const Text('Identity selfie', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF334761))),
                                              const SizedBox(height: 3),
                                              Text(_selfie == null ? 'Required to verify your field access' : 'Selfie captured successfully', style: const TextStyle(fontSize: 11, color: Color(0xFF718198))),
                                              const SizedBox(height: 7),
                                              TextButton.icon(
                                                onPressed: _submitting ? null : _takeSelfie,
                                                icon: const Icon(Icons.photo_camera_outlined, size: 17),
                                                label: Text(_selfie == null ? 'Take selfie' : 'Retake selfie'),
                                                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 30), alignment: Alignment.centerLeft),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                  SizedBox(
                                    height: 52,
                                    child: FilledButton(
                                      onPressed: _submitting ? null : _join,
                                      child: _submitting
                                          ? const SizedBox(width: 21, height: 21, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                                          : const Row(mainAxisAlignment: MainAxisAlignment.center, children: [Text('Continue securely'), SizedBox(width: 8), Icon(Icons.arrow_forward_rounded, size: 18)]),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.lock_outline, size: 13, color: Color(0xFF91A0B4)),
                              SizedBox(width: 6),
                              Text('Your access is managed by your site administrator', style: TextStyle(fontSize: 10, color: Color(0xFF91A0B4), fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
