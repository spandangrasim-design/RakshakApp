import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../util.dart';
import 'incident_screen.dart';
import 'onboarding_screen.dart';
import 'run_screen.dart';

/// Every route of the guard's industry, with today's status shared between all guards.
class RoutesScreen extends StatefulWidget {
  const RoutesScreen({super.key});

  @override
  State<RoutesScreen> createState() => _RoutesScreenState();
}

class _RoutesScreenState extends State<RoutesScreen> {
  List<Map<String, dynamic>> _routes = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    // Keep the board fresh so a route finished by another guard shows as DONE here.
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final r = await Api.routes();
      if (!mounted) return;
      setState(() {
        _routes = r;
        _error = null;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (!silent || _routes.isEmpty) _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _open(Map<String, dynamic> route) async {
    if (route['status'] == 'DONE') {
      final who = route['done_by'] ?? 'a guard';
      final at = fmtTime(route['done_at']?.toString());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Already completed today by $who${at.isEmpty ? '' : ' at $at'}.')),
      );
      return;
    }
    if (((route['checkpoints'] as List?) ?? []).isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This route has no checkpoints yet.')),
      );
      return;
    }
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => RunScreen(route: route)));
    if (mounted) _load(silent: true);
  }

  Future<void> _leave() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave this device?'),
        content: const Text('You will need the site code and a new selfie to join again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok != true) return;
    await Session.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const OnboardingScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final completedCount = _routes.where((r) => r['status'] == 'DONE').length;
    final activeCount = _routes.where((r) => r['status'] == 'IN_PROGRESS' || r['status'] == 'PAUSED').length;

    return Scaffold(
      appBar: AppBar(
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(Session.industry.isEmpty ? 'Routes' : Session.industry,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            Text(Session.name, style: const TextStyle(fontSize: 12, color: Colors.black54)),
          ],
        ),
        actions: [
          if (Session.can('report_incident') && Session.formFields.where((f) => f != 'group').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: TextButton.icon(
                style: TextButton.styleFrom(
                  foregroundColor: Colors.red.shade700,
                  backgroundColor: Colors.red.shade50,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                ),
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const IncidentScreen()),
                  );
                },
                icon: const Icon(Icons.report_problem_rounded, size: 18),
                label: const Text('Report', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),
            ),
          IconButton(onPressed: () => _load(), icon: const Icon(Icons.refresh)),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'leave') _leave();
            },
            itemBuilder: (_) => const [PopupMenuItem(value: 'leave', child: Text('Leave this device'))],
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 4),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFFFFFFFF), Color(0xFFF0F6FF)],
                      ),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0xFFE2EAF4)),
                      boxShadow: [BoxShadow(color: const Color(0xFF17345F).withOpacity(.045), blurRadius: 18, offset: const Offset(0, 5))],
                    ),
                    child: Row(
                      children: [
                        Expanded(child: _RouteSummaryMetric(label: 'Assigned routes', value: '${_routes.length}', icon: Icons.route_rounded, color: const Color(0xFF245BDB))),
                        Container(width: 1, height: 42, color: const Color(0xFFE2EAF4)),
                        const SizedBox(width: 12),
                        Expanded(child: _RouteSummaryMetric(label: 'Completed today', value: '$completedCount', icon: Icons.check_circle_outline_rounded, color: const Color(0xFF12805C))),
                        Container(width: 1, height: 42, color: const Color(0xFFE2EAF4)),
                        const SizedBox(width: 12),
                        Expanded(child: _RouteSummaryMetric(label: 'In progress', value: '$activeCount', icon: Icons.timelapse_rounded, color: const Color(0xFFB7791F))),
                      ],
                    ),
                  ),
                ),
                if (_error != null && _routes.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
                    child: Container(
                      padding: const EdgeInsets.all(11),
                      decoration: BoxDecoration(color: const Color(0xFFFFF7E8), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF4D7A0))),
                      child: Row(children: [const Icon(Icons.cloud_off_rounded, size: 17, color: Color(0xFF9A6700)), const SizedBox(width: 8), Expanded(child: Text('Showing last synced routes. ${_error!}', style: const TextStyle(fontSize: 11, color: Color(0xFF8A5A00))))]),
                    ),
                  ),
                if (Session.can('report_incident') && Session.formFields.where((f) => f != 'group').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 2),
                    child: Material(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(14),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const IncidentScreen()),
                          );
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.red.shade200),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.red.shade600,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: const Icon(Icons.report_problem_rounded, color: Colors.white, size: 22),
                              ),
                              const SizedBox(width: 12),
                              const Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Report an Incident',
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.black87),
                                    ),
                                    SizedBox(height: 2),
                                    Text(
                                      'Tap to log a safety, fire, security, or equipment issue anytime',
                                      style: TextStyle(fontSize: 12, color: Colors.black54),
                                    ),
                                  ],
                                ),
                              ),
                              Icon(Icons.chevron_right, color: Colors.red.shade700),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _load,
                    child: _error != null && _routes.isEmpty
                  ? ListView(children: [
                      Padding(padding: const EdgeInsets.all(24), child: Text(_error!)),
                    ])
                  : _routes.isEmpty
                      ? ListView(children: const [
                          Padding(
                            padding: EdgeInsets.all(24),
                            child: Text('No routes are available yet. Ask your supervisor to create one.'),
                          ),
                        ])
                      : ListView.separated(
                          padding: const EdgeInsets.all(14),
                          itemCount: _routes.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 10),
                          itemBuilder: (_, i) => _RouteCard(route: _routes[i], onTap: () => _open(_routes[i])),
                        ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _RouteSummaryMetric extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _RouteSummaryMetric({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [Icon(icon, size: 14, color: color), const SizedBox(width: 5), Expanded(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: Color(0xFF718198))))]),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, color: Color(0xFF172B4D), letterSpacing: -.5)),
      ],
    );
  }
}

class _RouteCard extends StatelessWidget {
  final Map<String, dynamic> route;
  final VoidCallback onTap;

  const _RouteCard({required this.route, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final status = (route['status'] ?? 'PENDING').toString();
    final prog = route['progress'] is Map ? Map<String, dynamic>.from(route['progress'] as Map) : <String, dynamic>{};
    final done = (prog['scanned'] ?? 0) as int;
    final total = (prog['total'] ?? ((route['checkpoints'] as List?) ?? []).length) as int;
    final others = ((route['on_it'] as List?) ?? []).map((e) => e.toString()).toList();
    final pausedBy = ((route['paused_by'] as List?) ?? []).map((e) => e.toString()).toList();
    final myRun = route['my_run'];

    Color color;
    String label;
    IconData icon;
    switch (status) {
      case 'DONE':
        color = Colors.green.shade700;
        label = 'Done';
        icon = Icons.check_circle;
        break;
      case 'IN_PROGRESS':
        color = Colors.orange.shade800;
        label = 'In progress';
        icon = Icons.directions_walk;
        break;
      case 'PAUSED':
        color = Colors.blue.shade700;
        label = 'Paused';
        icon = Icons.pause_circle;
        break;
      case 'PARTIAL':
        color = Colors.deepOrange.shade700;
        label = 'Partly done';
        icon = Icons.timelapse;
        break;
      default:
        color = Colors.blueGrey;
        label = 'Not started';
        icon = Icons.radio_button_unchecked;
    }

    String detail;
    if (status == 'DONE') {
      final at = fmtTime(route['done_at']?.toString());
      detail = 'Completed by ${route['done_by'] ?? 'a guard'}${at.isEmpty ? '' : ' at $at'}';
    } else if (myRun is Map) {
      detail = myRun['status'] == 'PAUSED'
          ? 'You paused this route · $done of $total done'
          : 'Your run · $done of $total checkpoints done';
    } else if (status == 'PARTIAL') {
      final last = route['last_ended'];
      final who = last is Map ? ' (stopped by ${last['by']})' : '';
      detail = '$done of $total done$who · needs a guard to continue';
    } else if (status == 'PAUSED') {
      detail = 'Paused by ${pausedBy.isEmpty ? 'a guard' : pausedBy.join(', ')} · $done of $total done';
    } else if (others.isNotEmpty) {
      detail = 'On it now: ${others.join(', ')} · $done of $total done';
    } else {
      detail = '$total checkpoint${total == 1 ? '' : 's'}';
    }

    final double progress = total <= 0 ? 0.0 : (done / total).clamp(0.0, 1.0).toDouble();
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFE3EAF4)),
            boxShadow: [BoxShadow(color: const Color(0xFF17345F).withOpacity(.035), blurRadius: 14, offset: const Offset(0, 4))],
          ),
          child: Row(
            children: [
              Container(
                height: 46,
                width: 46,
                decoration: BoxDecoration(color: color.withOpacity(.10), borderRadius: BorderRadius.circular(14)),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(route['name'].toString(), maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Color(0xFF172B4D)))),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                          decoration: BoxDecoration(color: color.withOpacity(.10), borderRadius: BorderRadius.circular(30)),
                          child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 10)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(detail, maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, height: 1.3, color: Color(0xFF718198))),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(20), child: LinearProgressIndicator(value: progress, minHeight: 5, backgroundColor: const Color(0xFFEAF0F7), valueColor: AlwaysStoppedAnimation<Color>(color)))),
                        const SizedBox(width: 9),
                        Text('$done/$total', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF52647C))),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 7),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFF9AA8BA), size: 21),
            ],
          ),
        ),
      ),
    );
  }
}
