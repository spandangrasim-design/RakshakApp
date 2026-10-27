import 'package:flutter/material.dart';
import '../services/incident_service.dart';
import '../screens/incident_list_screen.dart';
import '../screens/incident_thread_screen.dart';

class HomeIncidentsPreview extends StatefulWidget {
  final String guardId;
  final String token;
  final String guardName;
  final int refreshTick;

  const HomeIncidentsPreview({
    super.key,
    required this.guardId,
    required this.token,
    required this.guardName,
    this.refreshTick = 0,
  });

  @override
  State<HomeIncidentsPreview> createState() => _HomeIncidentsPreviewState();
}

class _HomeIncidentsPreviewState extends State<HomeIncidentsPreview> {
  List<dynamic> recentActiveIncidents = [];
  int totalActiveCount = 0;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRecentIncidents();
  }

  @override
  void didUpdateWidget(covariant HomeIncidentsPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshTick != widget.refreshTick) {
      _loadRecentIncidents();
    }
  }

  Future<void> _loadRecentIncidents() async {
    try {
      final allIncidents = await IncidentService.fetchIncidents(widget.token);
      if (mounted) {
        setState(() {
          final myActive = allIncidents.where((i) {
            final status = (i['status'] ?? 'OPEN').toString().toUpperCase();
            if (status == 'RESOLVED' || status == 'CLOSED') return false;
            final gid = (i['guard_id'] ?? '').toString();
            final assignedTo = (i['assigned_to'] ?? '').toString().toLowerCase();
            return gid == widget.guardId ||
                assignedTo == widget.guardName.toLowerCase();
          }).toList();

          totalActiveCount = myActive.length;
          recentActiveIncidents = myActive.take(3).toList();
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  String _formatCaseCode(Map<String, dynamic> inc) {
    final raw = (inc['client_incident_id'] ?? inc['incident_id'] ?? '100001')
        .toString();
    final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    final padded = digits.padRight(6, '0').substring(0, 6);
    return 'RKS-$padded';
  }

  String _formatRelativeTime(String? iso) {
    if (iso == null || iso.isEmpty) return 'Just now';
    try {
      final dt = DateTime.parse(iso).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      return '${diff.inDays}d ago';
    } catch (_) {
      return 'Recent';
    }
  }

  Color _getPriorityColor(String priority) {
    switch (priority.toUpperCase()) {
      case 'P1':
        return const Color(0xFFDC2626);
      case 'P2':
        return const Color(0xFFEA580C);
      case 'P3':
        return const Color(0xFF2563EB);
      default:
        return const Color(0xFF475569);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: const Center(
          child: SizedBox(
            height: 22,
            width: 22,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Text(
                  'Active Dispatch Tickets',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: totalActiveCount > 0
                        ? const Color(0xFFFEE2E2)
                        : const Color(0xFFE2E8F0),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$totalActiveCount',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: totalActiveCount > 0
                          ? const Color(0xFFB91C1C)
                          : const Color(0xFF475569),
                    ),
                  ),
                ),
              ],
            ),
            TextButton.icon(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => IncidentListScreen(
                      guardId: widget.guardId,
                      token: widget.token,
                      guardName: widget.guardName,
                    ),
                  ),
                ).then((_) => _loadRecentIncidents());
              },
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              icon: const Text(
                'View All',
                style: TextStyle(
                  color: Color(0xFF1E3A8A),
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              label: const Icon(
                Icons.arrow_forward_ios,
                size: 12,
                color: Color(0xFF1E3A8A),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (recentActiveIncidents.isEmpty)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFECFDF5),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.verified_user_outlined,
                    color: Color(0xFF059669),
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'All Clear — Zero Open Tickets',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'No active security incidents assigned to you right now.',
                        style: TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: recentActiveIncidents.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final incident =
                  recentActiveIncidents[index] as Map<String, dynamic>;
              final priority = (incident['priority'] ?? 'P3').toString();
              final pColor = _getPriorityColor(priority);
              final caseCode = _formatCaseCode(incident);
              final title = (incident['title'] ??
                      incident['description'] ??
                      'Security Incident')
                  .toString();
              final group =
                  (incident['assignment_group'] ?? 'Security Operations L1')
                      .toString();
              final category =
                  (incident['category'] ?? 'Security / Patrol').toString();
              final timeAgo =
                  _formatRelativeTime(incident['reported_at']?.toString());

              return Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => IncidentThreadScreen(
                          incidentId:
                              (incident['client_incident_id'] ?? '').toString(),
                          token: widget.token,
                          guardName: widget.guardName,
                        ),
                      ),
                    ).then((_) => _loadRecentIncidents());
                  },
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.02),
                          blurRadius: 6,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: pColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: pColor.withValues(alpha: 0.3),
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            priority,
                            style: TextStyle(
                              color: pColor,
                              fontWeight: FontWeight.w900,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFF1F5F9),
                                      borderRadius: BorderRadius.circular(5),
                                    ),
                                    child: Text(
                                      caseCode,
                                      style: const TextStyle(
                                        fontFamily: 'monospace',
                                        fontWeight: FontWeight.w800,
                                        fontSize: 10,
                                        color: Color(0xFF1E3A8A),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      category,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: Color(0xFF64748B),
                                      ),
                                    ),
                                  ),
                                  Text(
                                    timeAgo,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: Color(0xFF94A3B8),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 5),
                              Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.groups_2_outlined,
                                    size: 13,
                                    color: Color(0xFF059669),
                                  ),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                      group,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xFF059669),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(
                          Icons.chevron_right_rounded,
                          color: Color(0xFF94A3B8),
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}