import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:uuid/uuid.dart';

import '../api.dart';
import '../session.dart';
import '../util.dart';
import 'completed_screen.dart';
import 'incident_screen.dart';
import 'scanner_screen.dart';

/// One patrol run: scan every checkpoint's real QR code, with pause / end controls.
/// Progress is shared: checkpoints scanned by another guard in this round are already ticked.
class RunScreen extends StatefulWidget {
  final Map<String, dynamic> route;

  const RunScreen({super.key, required this.route});

  @override
  State<RunScreen> createState() => _RunScreenState();
}

class _EndChoice {
  final String reason;
  final String note;
  _EndChoice(this.reason, this.note);
}

class _RunScreenState extends State<RunScreen> {
  static const _endReasons = <String, String>{
    'SHIFT_ENDING': 'My shift is ending',
    'OTHER_WORK': 'I was called for other work',
    'EMERGENCY': 'Emergency',
    'ROUTE_BLOCKED': 'The route is blocked',
    'OTHER': 'Another reason',
  };

  String? _sessionId;
  bool _starting = true;
  bool _busy = false;
  bool _paused = false;
  String? _error;
  Timer? _clock;

  late final List<Map<String, dynamic>> _cps;
  final Set<String> _scanned = {};

  @override
  void initState() {
    super.initState();
    _cps = ((widget.route['checkpoints'] as List?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    for (final c in _cps) {
      if (c['scanned'] == true) _scanned.add(c['id'].toString());
    }
    // Re-check the shift banner once a minute.
    _clock = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted) setState(() {});
    });
    _start();
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final d = await Api.startRun(widget.route['id'].toString());
      if (!mounted) return;
      setState(() {
        _sessionId = d['session_id'].toString();
        _paused = d['status'] == 'PAUSED';
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

  // ---------- shift banner ----------
  /// Text for the banner when the industry's shift is about to end (or already ended); null otherwise.
  String? _shiftNotice() {
    final end = DateTime.tryParse((Api.shift?['end_at'] ?? '').toString())?.toLocal();
    if (end == null) return null;
    final left = end.difference(DateTime.now()).inMinutes;
    if (left > 20) return null;
    if (left <= 0) {
      return 'Your shift ended at ${fmtTime(end.toUtc().toIso8601String())}. Finish the route, or pause / end it if you have to leave.';
    }
    return 'Your shift ends in $left min (${fmtTime(end.toUtc().toIso8601String())}). Finish the route, or pause / end it if you have to leave.';
  }

  // ---------- QR + GPS ----------
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
    if (_busy || _sessionId == null || _paused) return;

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
      _snack('"$cpName" is already scanned in this round.');
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
        match.first['scanned_by'] = Session.name;
        match.first['scanned_at'] = DateTime.now().toUtc().toIso8601String();
        _busy = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(e.message);
      return;
    }

    _snack('"$cpName" verified');

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

  // ---------- pause / resume / end ----------
  Future<void> _pause() async {
    if (_busy || _sessionId == null) return;
    setState(() => _busy = true);
    try {
      await Api.pauseRun(_sessionId!);
      if (!mounted) return;
      setState(() {
        _paused = true;
        _busy = false;
      });
      _snack('Route paused. Resume when you are back.');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(e.message);
    }
  }

  Future<void> _resume() async {
    if (_busy || _sessionId == null) return;
    setState(() => _busy = true);
    try {
      await Api.resumeRun(_sessionId!);
      if (!mounted) return;
      setState(() {
        _paused = false;
        _busy = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(e.message);
    }
  }

  Future<_EndChoice?> _askEnd() {
    var reason = _shiftNotice() != null ? 'SHIFT_ENDING' : 'OTHER_WORK';
    final note = TextEditingController();
    return showDialog<_EndChoice>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('End this route?'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${_scanned.length} of ${_cps.length} checkpoints are done. The next guard can continue with the rest.',
                  style: const TextStyle(fontSize: 13, color: Colors.black54),
                ),
                const SizedBox(height: 8),
                for (final e in _endReasons.entries)
                  RadioListTile<String>(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    value: e.key,
                    groupValue: reason,
                    title: Text(e.value),
                    onChanged: (v) => setLocal(() => reason = v ?? reason),
                  ),
                TextField(
                  controller: note,
                  maxLength: 200,
                  decoration: const InputDecoration(labelText: 'Note (optional)', border: OutlineInputBorder()),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Keep going')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
              onPressed: () => Navigator.pop(ctx, _EndChoice(reason, note.text.trim())),
              child: const Text('End route'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _end() async {
    if (_busy || _sessionId == null) return;
    final choice = await _askEnd();
    if (choice == null || !mounted) return;

    setState(() => _busy = true);
    try {
      final d = await Api.endRun(_sessionId!, reason: choice.reason, note: choice.note);
      if (!mounted) return;
      setState(() => _busy = false);
      if (d['completed'] == true) {
        await Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => CompletedScreen(routeName: widget.route['name'].toString(), doneAt: d['done_at']?.toString()),
          ),
        );
        return;
      }
      _snack('Route ended at ${_scanned.length} of ${_cps.length}. The next guard can continue.');
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(e.message);
    }
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final total = _cps.length;
    final done = _scanned.length;
    final allScanned = total > 0 && done >= total;
    final notice = _shiftNotice();

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.route['name'].toString()),
        actions: [
          if (!_starting && _error == null)
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'pause') _pause();
                if (v == 'end') _end();
              },
              itemBuilder: (_) => [
                if (!_paused) const PopupMenuItem(value: 'pause', child: Text('Pause route')),
                const PopupMenuItem(value: 'end', child: Text('End route')),
              ],
            ),
        ],
      ),
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
                    if (notice != null)
                      Container(
                        width: double.infinity,
                        color: Colors.amber.shade100,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        child: Row(
                          children: [
                            Icon(Icons.schedule, color: Colors.amber.shade900, size: 20),
                            const SizedBox(width: 10),
                            Expanded(child: Text(notice, style: TextStyle(color: Colors.amber.shade900, fontSize: 13))),
                          ],
                        ),
                      ),
                    if (_paused)
                      Container(
                        width: double.infinity,
                        color: Colors.blue.shade50,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        child: Row(
                          children: [
                            Icon(Icons.pause_circle, color: Colors.blue.shade700),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text('Route paused. Scanning is off until you resume.',
                                  style: TextStyle(color: Colors.blue.shade800, fontWeight: FontWeight.w600)),
                            ),
                          ],
                        ),
                      ),
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
                          final by = (cp['scanned_by'] ?? '').toString();
                          final at = fmtTime(cp['scanned_at']?.toString());
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
                              subtitle: Text(ok
                                  ? 'Verified${by.isEmpty ? '' : ' · $by'}${at.isEmpty ? '' : ' · $at'}'
                                  : 'Waiting to be scanned'),
                            ),
                          );
                        },
                      ),
                    ),
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            FilledButton.icon(
                              onPressed: _busy ? null : (_paused ? _resume : (allScanned ? _finish : _scan)),
                              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                              icon: Icon(_paused ? Icons.play_arrow : (allScanned ? Icons.flag : Icons.qr_code_scanner)),
                              label: Text(
                                _paused ? 'Resume route' : (allScanned ? 'Finish route' : 'Scan next checkpoint'),
                                style: const TextStyle(fontSize: 16),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                if (!_paused)
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: _busy ? null : _pause,
                                      icon: const Icon(Icons.pause),
                                      label: const Text('Pause'),
                                    ),
                                  ),
                                if (!_paused) const SizedBox(width: 10),
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: _busy ? null : _end,
                                    style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700),
                                    icon: const Icon(Icons.stop_circle_outlined),
                                    label: const Text('End route'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}
