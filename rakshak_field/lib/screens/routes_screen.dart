import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../util.dart';
import '../theme/app_theme.dart';
import '../widgets/responsive.dart';
import '../widgets/ui_kit.dart';
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

  bool get _canReport =>
      Session.can('report_incident') && Session.formFields.where((f) => f != 'group').isNotEmpty;

  void _openReport() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const IncidentScreen()));

  @override
  Widget build(BuildContext context) {
    final doneCount = _routes.where((r) => r['status'] == 'DONE').length;
    final pad = pagePadding(context);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(Session.industry.isEmpty ? 'Routes' : Session.industry, maxLines: 1, overflow: TextOverflow.ellipsis),
            Text(Session.name, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: AppColors.inkSoft)),
          ],
        ),
        actions: [
          IconButton(tooltip: 'Refresh', onPressed: () => _load(), icon: const Icon(Icons.refresh)),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'leave') _leave();
            },
            itemBuilder: (_) => const [PopupMenuItem(value: 'leave', child: Text('Leave this device'))],
          ),
        ],
      ),
      // Report is the one urgent action, so it stays one thumb-tap away.
      floatingActionButton: _canReport
          ? FloatingActionButton.extended(
              onPressed: _openReport,
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.report_problem_rounded),
              label: const Text('Report incident', style: TextStyle(fontWeight: FontWeight.w800)),
            )
          : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  if (_routes.isNotEmpty)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(pad.left, 16, pad.right, 4),
                        child: AppCard(
                          color: AppColors.brandSoft,
                          borderColor: AppColors.brand.withAlpha(40),
                          child: Row(children: [
                            const Icon(Icons.route_outlined, color: AppColors.brand),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text('$doneCount of ${_routes.length} routes done today',
                                  style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brandDark)),
                            ),
                          ]),
                        ),
                      ),
                    ),
                  if (_error != null && _routes.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(icon: Icons.cloud_off_outlined, title: 'Could not load routes', message: _error),
                    )
                  else if (_routes.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(icon: Icons.route_outlined, title: 'No routes yet', message: 'Ask your supervisor to create one.'),
                    )
                  else
                    SliverPadding(
                      // bottom padding keeps the last card clear of the floating button
                      padding: EdgeInsets.fromLTRB(pad.left, 12, pad.right, 96),
                      // One column on phones, two on tablets, three on large screens — automatically.
                      sliver: SliverGrid(
                        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 520, mainAxisExtent: 132, crossAxisSpacing: 12, mainAxisSpacing: 12,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (_, i) => _RouteCard(route: _routes[i], onTap: () => _open(_routes[i])),
                          childCount: _routes.length,
                        ),
                      ),
                    ),
                ],
              ),
            ),
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
        color = AppColors.ok; label = 'Done'; icon = Icons.check_circle; break;
      case 'IN_PROGRESS':
        color = AppColors.warn; label = 'In progress'; icon = Icons.directions_walk; break;
      case 'PAUSED':
        color = AppColors.brand; label = 'Paused'; icon = Icons.pause_circle; break;
      case 'PARTIAL':
        color = const Color(0xFFEA580C); label = 'Partly done'; icon = Icons.timelapse; break;
      default:
        color = AppColors.inkSoft; label = 'Not started'; icon = Icons.radio_button_unchecked;
    }

    String detail;
    if (status == 'DONE') {
      final at = fmtTime(route['done_at']?.toString());
      detail = 'Completed by ${route['done_by'] ?? 'a guard'}${at.isEmpty ? '' : ' at $at'}';
    } else if (myRun is Map) {
      detail = myRun['status'] == 'PAUSED' ? 'You paused this route' : 'Your run is in progress';
    } else if (status == 'PARTIAL') {
      final last = route['last_ended'];
      final who = last is Map ? ' (stopped by ${last['by']})' : '';
      detail = 'Needs a guard to continue$who';
    } else if (status == 'PAUSED') {
      detail = 'Paused by ${pausedBy.isEmpty ? 'a guard' : pausedBy.join(', ')}';
    } else if (others.isNotEmpty) {
      detail = 'On it now: ${others.join(', ')}';
    } else {
      detail = '$total checkpoint${total == 1 ? '' : 's'}';
    }

    final progress = total == 0 ? 0.0 : (done / total).clamp(0.0, 1.0);

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(color: color.withAlpha(30), borderRadius: BorderRadius.circular(13)),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(route['name'].toString(), maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(detail, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft)),
              ]),
            ),
            const SizedBox(width: 8),
            StatusPill(label: label, color: color),
          ]),
          if (status != 'DONE')
            Row(children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(value: progress, minHeight: 7, backgroundColor: AppColors.line, color: color),
                ),
              ),
              const SizedBox(width: 10),
              Text('$done/$total', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.inkSoft)),
            ]),
        ],
      ),
    );
  }
}
