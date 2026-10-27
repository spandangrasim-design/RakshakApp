import 'package:flutter/material.dart';
import '../services/incident_service.dart';
import 'incident_report_screen.dart';
import 'incident_thread_screen.dart';

class IncidentListScreen extends StatefulWidget {
  final String guardId;
  final String token;
  final String guardName;

  const IncidentListScreen({
    super.key,
    required this.guardId,
    required this.token,
    required this.guardName,
  });

  @override
  State<IncidentListScreen> createState() => _IncidentListScreenState();
}

class _IncidentListScreenState extends State<IncidentListScreen> {
  List<dynamic> activeIncidents = [];
  List<dynamic> resolvedIncidents = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadAllIncidents();
  }

  Future<void> _loadAllIncidents() async {
    try {
      final allIncidents = await IncidentService.fetchIncidents(widget.token);
      if (mounted) {
        setState(() {
          final myIncidents = allIncidents.where((i) {
            final gid = i['guard_id']?.toString() ?? '';
            final assignedTo =
                (i['assigned_to'] ?? '').toString().toLowerCase();
            return gid.isEmpty ||
                gid == widget.guardId ||
                assignedTo == widget.guardName.toLowerCase();
          }).toList();

          activeIncidents = myIncidents
              .where((i) =>
                  (i['status'] ?? '').toString().toUpperCase() != 'RESOLVED')
              .toList();

          resolvedIncidents = myIncidents
              .where((i) =>
                  (i['status'] ?? '').toString().toUpperCase() == 'RESOLVED')
              .toList();

          isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading incidents: $e');
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

  Color _getPriorityColor(String? priority) {
    switch (priority?.toUpperCase()) {
      case 'P1':
        return const Color(0xFFDC2626);
      case 'P2':
        return const Color(0xFFEA580C);
      case 'P3':
        return const Color(0xFF2563EB);
      default:
        return const Color(0xFF64748B);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: const Color(0xFFF8FAFC),
        appBar: AppBar(
          title: const Text(
            'Incident Tickets',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
          ),
          backgroundColor: const Color(0xFF1E3A8A),
          foregroundColor: Colors.white,
          elevation: 0,
          bottom: TabBar(
            indicatorColor: Colors.white,
            indicatorWeight: 3,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            labelStyle: const TextStyle(fontWeight: FontWeight.bold),
            tabs: [
              Tab(text: 'Active (${activeIncidents.length})'),
              Tab(text: 'Resolved (${resolvedIncidents.length})'),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const IncidentReportScreen(),
              ),
            ).then((_) => _loadAllIncidents());
          },
          backgroundColor: const Color(0xFFDC2626),
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add_alert_rounded, size: 18),
          label: const Text(
            'Report Incident',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
        body: isLoading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                children: [
                  _buildIncidentList(activeIncidents, isActive: true),
                  _buildIncidentList(resolvedIncidents, isActive: false),
                ],
              ),
      ),
    );
  }

  Widget _buildIncidentList(List<dynamic> incidents, {required bool isActive}) {
    if (incidents.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isActive
                  ? Icons.assignment_turned_in_outlined
                  : Icons.inventory_2_outlined,
              size: 56,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 12),
            Text(
              isActive
                  ? 'No active incidents pending.'
                  : 'No resolved incidents yet.',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 15),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadAllIncidents,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 80),
        itemCount: incidents.length,
        itemBuilder: (context, index) {
          final incident = incidents[index] as Map<String, dynamic>;
          final priority = incident['priority']?.toString() ?? 'P3';
          final pColor = _getPriorityColor(priority);
          final photoUrl = incident['photo_url']?.toString();
          final incidentId =
              (incident['client_incident_id'] ?? incident['incident_id'] ?? '')
                  .toString();
          final status = (incident['status'] ?? 'OPEN').toString().toUpperCase();
          final caseCode = _formatCaseCode(incident);
          final group =
              (incident['assignment_group'] ?? 'Security Operations L1')
                  .toString();

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.white,
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
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => IncidentThreadScreen(
                      incidentId: incidentId,
                      token: widget.token,
                      guardName: widget.guardName,
                    ),
                  ),
                ).then((_) => _loadAllIncidents());
              },
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: pColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                        border:
                            Border.all(color: pColor.withValues(alpha: 0.3)),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        priority,
                        style: TextStyle(
                          color: pColor,
                          fontWeight: FontWeight.w900,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF1F5F9),
                                  borderRadius: BorderRadius.circular(5),
                                ),
                                child: Text(
                                  caseCode,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontWeight: FontWeight.w800,
                                    fontSize: 11,
                                    color: Color(0xFF1E3A8A),
                                  ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: status == 'RESOLVED'
                                      ? Colors.green.shade50
                                      : Colors.amber.shade50,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  status,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: status == 'RESOLVED'
                                        ? Colors.green.shade700
                                        : Colors.amber.shade900,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            (incident['title'] ??
                                    incident['description'] ??
                                    'Incident Report')
                                .toString(),
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                              color: Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            (incident['description'] ?? '').toString(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Color(0xFF64748B), fontSize: 12),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(Icons.groups_2_outlined,
                                  size: 13, color: Color(0xFF059669)),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  group,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFF059669),
                                    fontWeight: FontWeight.w700,
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                              if (photoUrl != null && photoUrl.isNotEmpty) ...[
                                const Icon(Icons.photo_camera,
                                    size: 12, color: Colors.blue),
                                const SizedBox(width: 3),
                                const Text('Photo',
                                    style: TextStyle(
                                        color: Colors.blue,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600)),
                              ]
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}