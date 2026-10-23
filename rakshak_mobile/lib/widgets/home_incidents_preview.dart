import 'package:flutter/material.dart';
import '../services/incident_service.dart';
import '../screens/incident_list_screen.dart';
import '../screens/incident_thread_screen.dart';

class HomeIncidentsPreview extends StatefulWidget {
  final String guardId;
  final String token;
  final String guardName;

  const HomeIncidentsPreview({super.key, required this.guardId, required this.token, required this.guardName});

  @override
  State<HomeIncidentsPreview> createState() => _HomeIncidentsPreviewState();
}

class _HomeIncidentsPreviewState extends State<HomeIncidentsPreview> {
  List<dynamic> recentActiveIncidents = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRecentIncidents();
  }

  Future<void> _loadRecentIncidents() async {
    try {
      final allIncidents = await IncidentService.fetchIncidents(widget.token);
      if (mounted) {
        setState(() {
          final myActive = allIncidents.where((i) => i['guard_id'] == widget.guardId && i['status'] != 'RESOLVED').toList();
          recentActiveIncidents = myActive.take(2).toList();
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (isLoading) return Center(child: CircularProgressIndicator());

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Active Tickets", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              TextButton(
                onPressed: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => IncidentListScreen(guardId: widget.guardId, token: widget.token, guardName: widget.guardName)))
                  .then((_) => _loadRecentIncidents());
                },
                child: Text("View All", style: TextStyle(color: Colors.blue.shade900)),
              )
            ],
          ),
        ),
        if (recentActiveIncidents.isEmpty)
          Padding(padding: const EdgeInsets.symmetric(horizontal: 16.0), child: Text("No active incidents requiring your attention.", style: TextStyle(color: Colors.grey))),
        ListView.builder(
          shrinkWrap: true, physics: NeverScrollableScrollPhysics(), itemCount: recentActiveIncidents.length,
          itemBuilder: (context, index) {
            final incident = recentActiveIncidents[index];
            return Card(
              margin: EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              elevation: 1, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              child: ListTile(
                leading: CircleAvatar(backgroundColor: incident['priority'] == 'P1' ? Colors.red : Colors.orange, child: Icon(Icons.warning_amber_rounded, color: Colors.white, size: 20)),
                title: Text(incident['title'] ?? 'Incident Reported', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                subtitle: Text("Status: ${incident['status']}", style: TextStyle(color: Colors.redAccent, fontSize: 12)),
                trailing: Icon(Icons.arrow_forward_ios, size: 14),
                onTap: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => IncidentThreadScreen(incidentId: incident['client_incident_id'], token: widget.token, guardName: widget.guardName)))
                  .then((_) => _loadRecentIncidents());
                },
              ),
            );
          },
        ),
      ],
    );
  }
}