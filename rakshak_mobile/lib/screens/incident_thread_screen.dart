import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/incident_service.dart';

class IncidentThreadScreen extends StatefulWidget {
  final String incidentId;
  final String token;
  final String guardName;

  const IncidentThreadScreen({
    super.key,
    required this.incidentId,
    required this.token,
    required this.guardName,
  });

  @override
  State<IncidentThreadScreen> createState() => _IncidentThreadScreenState();
}

class _IncidentThreadScreenState extends State<IncidentThreadScreen> {
  Map<String, dynamic>? incident;
  List<dynamic> updates = [];
  bool isLoading = true;
  bool isPosting = false;
  
  final TextEditingController _messageController = TextEditingController();
  File? _selectedImage;
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _loadThread();
  }

  Future<void> _loadThread() async {
    try {
      final data = await IncidentService.fetchIncidentDetails(widget.incidentId, widget.token);
      if (mounted) {
        setState(() {
          incident = data['incident'];
          updates = data['updates'];
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  Future<void> _pickImage() async {
    final XFile? image = await _picker.pickImage(source: ImageSource.camera, imageQuality: 70);
    if (image != null) setState(() => _selectedImage = File(image.path));
  }

  Future<void> _sendUpdate() async {
    if (_messageController.text.trim().isEmpty && _selectedImage == null) return;
    
    setState(() => isPosting = true);
    
    String? base64Image;
    if (_selectedImage != null) {
      final bytes = await _selectedImage!.readAsBytes();
      base64Image = "data:image/jpeg;base64,${base64Encode(bytes)}";
    }

    bool success = await IncidentService.postIncidentUpdate(
      incidentId: widget.incidentId,
      token: widget.token,
      guardName: widget.guardName,
      message: _messageController.text.trim(),
      base64Photo: base64Image,
    );

    if (success) {
      _messageController.clear();
      setState(() => _selectedImage = null);
      await _loadThread(); 
    }
    setState(() => isPosting = false);
  }

  @override
  Widget build(BuildContext context) {
    if (isLoading) return Scaffold(body: Center(child: CircularProgressIndicator()));
    if (incident == null) return Scaffold(body: Center(child: Text("Incident not found")));

    bool isResolved = incident!['status'] == 'RESOLVED';

    return Scaffold(
      appBar: AppBar(title: Text(incident!['title'] ?? 'Incident Thread'), backgroundColor: Colors.blue.shade900),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: EdgeInsets.all(16),
              children: [
                _buildChatBubble(
                  sender: "Original Report",
                  message: incident!['description'],
                  photoUrl: incident!['photo_url'],
                  isMe: true,
                  timestamp: incident!['reported_at'],
                ),
                ...updates.map((update) {
                  bool isGuard = update['sender_type'] == 'GUARD';
                  return _buildChatBubble(
                    sender: "${update['sender_name']} (${update['sender_type']})",
                    message: update['message'],
                    photoUrl: update['photo_url'],
                    isMe: isGuard,
                    timestamp: update['created_at'],
                  );
                }),
              ],
            ),
          ),
          if (!isResolved) _buildInputArea(),
          if (isResolved)
            Container(
              padding: EdgeInsets.all(16),
              color: Colors.green.shade50,
              width: double.infinity,
              child: Text("This ticket has been marked as RESOLVED by an Admin.", textAlign: TextAlign.center, style: TextStyle(color: Colors.green.shade800, fontWeight: FontWeight.bold)),
            )
        ],
      ),
    );
  }

  Widget _buildChatBubble({required String sender, required String message, String? photoUrl, required bool isMe, required String timestamp}) {
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(bottom: 16, left: isMe ? 40 : 0, right: isMe ? 0 : 40),
        padding: EdgeInsets.all(12),
        decoration: BoxDecoration(color: isMe ? Colors.blue.shade100 : Colors.grey.shade200, borderRadius: BorderRadius.circular(12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(sender, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey.shade700)),
            SizedBox(height: 4),
            Text(message, style: TextStyle(fontSize: 15)),
            if (photoUrl != null && photoUrl.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8.0),
                child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(photoUrl, height: 150, width: double.infinity, fit: BoxFit.cover)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, -2))]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_selectedImage != null)
            Stack(
              children: [
                Container(
                  margin: EdgeInsets.only(bottom: 8), height: 80, width: 80,
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), image: DecorationImage(image: FileImage(_selectedImage!), fit: BoxFit.cover)),
                ),
                Positioned(right: -10, top: -10, child: IconButton(icon: Icon(Icons.cancel, color: Colors.red), onPressed: () => setState(() => _selectedImage = null)))
              ],
            ),
          Row(
            children: [
              IconButton(icon: Icon(Icons.camera_alt, color: Colors.blue.shade900), onPressed: _pickImage),
              Expanded(
                child: TextField(
                  controller: _messageController,
                  decoration: InputDecoration(hintText: "Add an update or comment...", border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none), filled: true, fillColor: Colors.grey.shade100, contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10)),
                  maxLines: null,
                ),
              ),
              SizedBox(width: 8),
              isPosting
                  ? CircularProgressIndicator()
                  : CircleAvatar(backgroundColor: Colors.blue.shade900, child: IconButton(icon: Icon(Icons.send, color: Colors.white, size: 18), onPressed: _sendUpdate)),
            ],
          ),
        ],
      ),
    );
  }
}