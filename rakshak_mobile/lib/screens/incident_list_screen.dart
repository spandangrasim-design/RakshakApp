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
          final myIncidents = allIncidents.where((i) => i['guard_id'] == widget.guardId).toList();
          activeIncidents = myIncidents.where((i) => i['status'] != 'RESOLVED').toList();
          resolvedIncidents = myIncidents.where((i) => i['status'] == 'RESOLVED').toList();
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text("My Incidents"),
          backgroundColor: Colors.blue.shade900,
          bottom: TabBar(
            indicatorColor: Colors.white,
            tabs: [Tab(text: "Active (${activeIncidents.length})"), Tab(text: "Resolved (${resolvedIncidents.length})")],
          ),
        ),
        body: isLoading 
            ? Center(child: CircularProgressIndicator()) 
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
    if (incidents.isEmpty) return Center(child: Text(isActive ? "No active incidents." : "No resolved incidents yet."));

    return RefreshIndicator(
      onRefresh: _loadAllIncidents,
      child: ListView.builder(
        padding: EdgeInsets.all(12),
        itemCount: incidents.length,
        itemBuilder: (context, index) {
          final incident = incidents[index];
          return Card(
            elevation: 2, margin: EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: incident['priority'] == 'P1' ? Colors.red : Colors.orange,
                child: Text(incident['priority'], style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
              ),
              title: Text(incident['title'] ?? 'Incident Reported', style: TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text("${incident['status']}\n${incident['description']}", maxLines: 2, overflow: TextOverflow.ellipsis),
              trailing: Icon(Icons.chevron_right),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => IncidentThreadScreen(incidentId: incident['client_incident_id'], token: widget.token, guardName: widget.guardName)),
                ).then((_) => _loadAllIncidents()); 
              },
            ),
          );
        },
      ),
    );
  }
}