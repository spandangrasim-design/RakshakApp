import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme/app_theme.dart';
import '../widgets/responsive.dart';
import '../widgets/ui_kit.dart';
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
      backgroundColor: Colors.white,
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: pagePadding(context, top: 24),
                child: ResponsiveBody(
                  maxWidth: 480,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(children: [
                        Container(
                          width: 52, height: 52,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(colors: [AppColors.brand, AppColors.brandDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: const Icon(Icons.shield_outlined, color: Colors.white, size: 28),
                        ),
                        const SizedBox(width: 14),
                        const Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('Rakshak Field', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
                            Text('Set up once. No password needed.', style: TextStyle(color: AppColors.inkSoft)),
                          ]),
                        ),
                      ]),
                      const SizedBox(height: 28),
                      if (_loadError != null) ...[
                        ErrorBox(_loadError!),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(onPressed: _loadIndustries, icon: const Icon(Icons.refresh), label: const Text('Try again')),
                      ] else if (_industries.isEmpty) ...[
                        const EmptyState(
                          icon: Icons.factory_outlined,
                          title: 'No site is open yet',
                          message: 'Ask your administrator to switch on the Field app for your industry.',
                        ),
                        OutlinedButton.icon(onPressed: _loadIndustries, icon: const Icon(Icons.refresh), label: const Text('Refresh')),
                      ] else ...[
                        Center(
                          child: GestureDetector(
                            onTap: _submitting ? null : _takeSelfie,
                            child: Stack(children: [
                              Container(
                                width: 112, height: 112,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: AppColors.brandSoft,
                                  border: Border.all(color: AppColors.brand.withAlpha(60), width: 2),
                                  image: _selfie == null ? null : DecorationImage(image: MemoryImage(_selfie!), fit: BoxFit.cover),
                                ),
                                child: _selfie == null ? const Icon(Icons.person_outline, size: 48, color: AppColors.brand) : null,
                              ),
                              Positioned(
                                right: 0, bottom: 0,
                                child: Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(color: AppColors.brand, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3)),
                                  child: const Icon(Icons.photo_camera, size: 18, color: Colors.white),
                                ),
                              ),
                            ]),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Center(
                          child: TextButton(
                            onPressed: _submitting ? null : _takeSelfie,
                            child: Text(_selfie == null ? 'Take your selfie' : 'Retake selfie'),
                          ),
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          value: _tenantId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Industry', prefixIcon: Icon(Icons.factory_outlined)),
                          items: [for (final t in _industries) DropdownMenuItem(value: t['id'].toString(), child: Text(t['name'].toString(), overflow: TextOverflow.ellipsis))],
                          onChanged: (v) => setState(() => _tenantId = v),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _code,
                          textCapitalization: TextCapitalization.characters,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Site code', helperText: 'Given by your supervisor', prefixIcon: Icon(Icons.vpn_key_outlined)),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _name,
                          textCapitalization: TextCapitalization.words,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Your name', prefixIcon: Icon(Icons.person_outline)),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _phone,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.done,
                          decoration: const InputDecoration(labelText: 'Mobile number', prefixIcon: Icon(Icons.phone_outlined)),
                        ),
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: _submitting ? null : _join,
                          child: _submitting
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                              : const Text('Continue'),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}
