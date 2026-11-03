import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:uuid/uuid.dart';

import '../api.dart';
import '../session.dart';
import 'completed_screen.dart';
import 'incident_screen.dart';
import 'scanner_screen.dart';

/// One patrol run: scan every checkpoint's real QR code; after each scan, ask about incidents.
class RunScreen extends StatefulWidget {
  final Map<String, dynamic> route;

  const RunScreen({super.key, required this.route});

  @override
  State<RunScreen> createState() => _RunScreenState();
}

class _RunScreenState extends State<RunScreen> {
  String? _sessionId;
  bool _starting = true;
  bool _busy = false;
  String? _error;

  late final List<Map<String, dynamic>> _cps;
  final Set<String> _scanned = {};

  @override
  void initState() {
    super.initState();
    _cps = ((widget.route['checkpoints'] as List?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();

    final my = widget.route['my_run'];
    if (my is Map) {
      for (final id in (my['scanned_checkpoint_ids'] as List?) ?? []) {
        _scanned.add(id.toString());
      }
    }
    _start();
  }

  Future<void> _start() async {
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final id = await Api.startRun(widget.route['id'].toString());
      if (!mounted) return;
      setState(() {
        _sessionId = id;
        _starting = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _starting = false;
      });
    }
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  /// rakshak://cp?id=..&lat=..&lng=..&s=<signature>
  Map<String, String>? _parseQr(String raw) {
    try {
      final u = Uri.parse(raw);
      if (u.scheme != 'rakshak') return null;
      final id = u.queryParameters['id'];
      final lat = u.queryParameters['lat'];
      final lng = u.queryParameters['lng'];
      final sig = u.queryParameters['s'];
      if ([id, lat, lng, sig].any((v) => v == null || v.isEmpty)) return null;
      return {'id': id!, 'lat': lat!, 'lng': lng!, 's': sig!};
    } catch (_) {
      return null;
    }
  }

  Future<Position> _position() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw ApiException('Please turn on location (GPS).');
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        throw ApiException('Location permission is needed to confirm you are at the checkpoint.');
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 20),
      );
      if (pos.isMocked) {
        throw ApiException('Fake GPS detected. Turn off any mock-location app.');
      }
      return pos;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('Could not get your location. Move to open sky and try again.');
    }
  }

  Future<bool?> _askIncident(String checkpointName) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Any incident?'),
        content: Text('Did you notice anything wrong at "$checkpointName"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No, all clear')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Yes, report it')),
        ],
      ),
    );
  }

  Future<void> _scan() async {
    if (_busy || _sessionId == null) return;

    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen()),
    );
    if (raw == null || !mounted) return;

    final qr = _parseQr(raw);
    if (qr == null) {
      _snack('That is not a Rakshak checkpoint QR code.');
      return;
    }
    final match = _cps.where((c) => c['id'].toString() == qr['id']).toList();
    if (match.isEmpty) {
      _snack('This QR code does not belong to this route.');
      return;
    }
    final cpId = qr['id']!;
    final cpName = match.first['name'].toString();
    if (_scanned.contains(cpId)) {
      _snack('"$cpName" is already scanned.');
      return;
    }

    setState(() => _busy = true);
    try {
      final pos = await _position();
      await Api.submitScan(
        checkpointId: cpId,
        qrLat: qr['lat']!,
        qrLng: qr['lng']!,
        signature: qr['s']!,
        guardLat: pos.latitude,
        guardLng: pos.longitude,
        clientScanId: const Uuid().v4(),
      );
      if (!mounted) return;
      setState(() {
        _scanned.add(cpId);
        _busy = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(e.message);
      return;
    }

    _snack('"$cpName" verified');

    // Only ask when this industry bought incidents AND the admin allowed this guard to report.
    final fields = Session.formFields.where((f) => f != 'group');
    if (Session.can('report_incident') && fields.isNotEmpty) {
      final yes = await _askIncident(cpName);
      if (yes == true && mounted) {
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => IncidentScreen(checkpointName: cpName)),
        );
      }
    }

    if (!mounted) return;
    if (_scanned.length >= _cps.length) await _finish();
  }

  Future<void> _finish() async {
    setState(() => _busy = true);
    try {
      final doneAt = await Api.completeRun(_sessionId!);
      if (!mounted) return;
      setState(() => _busy = false);
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => CompletedScreen(routeName: widget.route['name'].toString(), doneAt: doneAt),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _cps.length;
    final done = _scanned.length;
    final allScanned = total > 0 && done >= total;

    return Scaffold(
      appBar: AppBar(title: Text(widget.route['name'].toString())),
      body: _starting
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        OutlinedButton(onPressed: _start, child: const Text('Try again')),
                        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back')),
                      ],
                    ),
                  ),
                )
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('$done of $total checkpoints scanned',
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 8),
                          LinearProgressIndicator(value: total == 0 ? 0 : done / total, minHeight: 8),
                        ],
                      ),
                    ),
                    if (_busy) const LinearProgressIndicator(),
                    Expanded(
                      child: ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _cps.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final cp = _cps[i];
                          final ok = _scanned.contains(cp['id'].toString());
                          return Container(
                            decoration: BoxDecoration(
                              color: ok ? Colors.green.shade50 : Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: ok ? Colors.green.shade200 : Colors.grey.shade200),
                            ),
                            child: ListTile(
                              leading: Icon(
                                ok ? Icons.check_circle : Icons.qr_code_2,
                                color: ok ? Colors.green.shade700 : Colors.blueGrey,
                              ),
                              title: Text(cp['name'].toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(ok ? 'Verified' : 'Waiting to be scanned'),
                            ),
                          );
                        },
                      ),
                    ),
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: FilledButton.icon(
                          onPressed: _busy ? null : (allScanned ? _finish : _scan),
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                          icon: Icon(allScanned ? Icons.flag : Icons.qr_code_scanner),
                          label: Text(
                            allScanned ? 'Finish route' : 'Scan next checkpoint',
                            style: const TextStyle(fontSize: 16),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}
