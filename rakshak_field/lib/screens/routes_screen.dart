import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../util.dart';
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
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(Session.industry.isEmpty ? 'Routes' : Session.industry,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            Text(Session.name, style: const TextStyle(fontSize: 12, color: Colors.black54)),
          ],
        ),
        actions: [
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
          : RefreshIndicator(
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
    final total = ((route['checkpoints'] as List?) ?? []).length;
    final myRun = route['my_run'];
    final mine = myRun is Map ? ((myRun['scanned_checkpoint_ids'] as List?) ?? []).length : null;
    final others = ((route['in_progress_by'] as List?) ?? []).map((e) => e.toString()).toList();

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
      default:
        color = Colors.blueGrey;
        label = 'Not started';
        icon = Icons.radio_button_unchecked;
    }

    String detail;
    if (status == 'DONE') {
      final at = fmtTime(route['done_at']?.toString());
      detail = 'Completed by ${route['done_by'] ?? 'a guard'}${at.isEmpty ? '' : ' at $at'}';
    } else if (mine != null) {
      detail = 'Your progress: $mine of $total checkpoints';
    } else if (others.isNotEmpty) {
      detail = 'On it now: ${others.join(', ')}';
    } else {
      detail = '$total checkpoint${total == 1 ? '' : 's'}';
    }

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: Row(
            children: [
              Icon(icon, color: color, size: 30),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(route['name'].toString(),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(detail, style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
