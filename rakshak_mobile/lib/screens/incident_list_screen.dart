import 'package:flutter/material.dart';
import '../services/incident_service.dart';
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
            return gid.isEmpty || gid == widget.guardId;
          }).toList();

          activeIncidents = myIncidents
              .where((i) => (i['status'] ?? '').toString().toUpperCase() != 'RESOLVED')
              .toList();

          resolvedIncidents = myIncidents
              .where((i) => (i['status'] ?? '').toString().toUpperCase() == 'RESOLVED')
              .toList();

          isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading incidents: $e');
      if (mounted) setState(() => isLoading = false);
    }
  }

  Color _getPriorityColor(String? priority) {
    switch (priority?.toUpperCase()) {
      case 'P1':
        return const Color(0xFFDC2626);
      case 'P2':
        return const Color(0xFFF97316);
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
            "Incident Tickets",
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
          ),
          backgroundColor: const Color(0xFF1E3A8A),
          foregroundColor: Colors.white,
          elevation: 0,
          bottom: TabBar(
            indicatorColor: Colors.white,
            indicatorWeight: 3,
            labelStyle: const TextStyle(fontWeight: FontWeight.bold),
            tabs: [
              Tab(text: "Active (${activeIncidents.length})"),
              Tab(text: "Resolved (${resolvedIncidents.length})"),
            ],
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
              isActive ? Icons.assignment_turned_in_outlined : Icons.inventory_2_outlined,
              size: 56,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 12),
            Text(
              isActive ? "No active incidents pending." : "No resolved incidents yet.",
              style: TextStyle(color: Colors.grey.shade600, fontSize: 15),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadAllIncidents,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        itemCount: incidents.length,
        itemBuilder: (context, index) {
          final incident = incidents[index];
          final priority = incident['priority']?.toString() ?? 'P4';
          final photoUrl = incident['photo_url']?.toString();
          final incidentId = incident['incident_id'] ?? incident['client_incident_id'] ?? '';
          final status = (incident['status'] ?? 'OPEN').toString().toUpperCase();

          return Card(
            elevation: 1,
            margin: const EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
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
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Priority Badge
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: _getPriorityColor(priority).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        priority,
                        style: TextStyle(
                          color: _getPriorityColor(priority),
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),

                    // Title & Description
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  incident['title'] ?? incident['description'] ?? 'Incident Report',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 15,
                                    color: Color(0xFF0F172A),
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: status == 'RESOLVED'
                                      ? Colors.green.shade50
                                      : Colors.blue.shade50,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  status,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: status == 'RESOLVED'
                                        ? Colors.green.shade700
                                        : Colors.blue.shade700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            incident['description'] ?? '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Icon(Icons.access_time, size: 12, color: Colors.grey.shade400),
                              const SizedBox(width: 4),
                              Text(
                                incident['reported_at'] != null
                                    ? DateTime.parse(incident['reported_at'])
                                        .toLocal()
                                        .toString()
                                        .substring(0, 16)
                                    : 'Just now',
                                style: TextStyle(color: Colors.grey.shade400, fontSize: 11),
                              ),
                              if (photoUrl != null && photoUrl.isNotEmpty) ...[
                                const SizedBox(width: 12),
                                const Icon(Icons.photo_camera, size: 12, color: Colors.blue),
                                const SizedBox(width: 3),
                                const Text("Photo Attached",
                                    style: TextStyle(color: Colors.blue, fontSize: 11)),
                              ]
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: Colors.grey),
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