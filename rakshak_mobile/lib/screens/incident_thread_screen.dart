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
          updates = data['updates'] ?? [];
          isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading incident thread: $e');
      if (mounted) setState(() => isLoading = false);
    }
  }

  Future<void> _pickImage() async {
    final XFile? image = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 60,
      maxWidth: 1024,
    );
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

    final success = await IncidentService.postIncidentUpdate(
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

  void _showEnlargedPhoto(String url) {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(12),
        child: Stack(
          alignment: Alignment.topRight,
          children: [
            InteractiveViewer(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  url,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => Container(
                    padding: const EdgeInsets.all(24),
                    color: Colors.white,
                    child: const Text("Unable to load full-size photo proof."),
                  ),
                ),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 30),
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNetworkImage(String? photoUrl) {
    if (photoUrl == null || photoUrl.isEmpty || !photoUrl.startsWith('http')) {
      return const SizedBox.shrink();
    }

    return GestureDetector(
      onTap: () => _showEnlargedPhoto(photoUrl),
      child: Padding(
        padding: const EdgeInsets.only(top: 8.0),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            photoUrl,
            height: 160,
            width: double.infinity,
            fit: BoxFit.cover,
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              return Container(
                height: 160,
                color: Colors.grey.shade100,
                child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
              );
            },
            errorBuilder: (context, error, stackTrace) {
              return Container(
                height: 80,
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                alignment: Alignment.center,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.broken_image_outlined, color: Colors.grey.shade400),
                    const SizedBox(width: 8),
                    Text(
                      "Photo evidence unavailable",
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (incident == null) {
      return Scaffold(
        appBar: AppBar(title: const Text("Incident Details")),
        body: const Center(child: Text("Incident record not found.")),
      );
    }

    final isResolved = (incident!['status'] ?? '').toString().toUpperCase() == 'RESOLVED';

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        title: Text(
          incident!['title'] ?? 'Incident Thread',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildChatBubble(
                  sender: "Initial Report",
                  message: incident!['description'] ?? '',
                  photoUrl: incident!['photo_url'],
                  isMe: true,
                  timestamp: incident!['reported_at'] ?? '',
                ),
                ...updates.map((update) {
                  final isGuard = update['sender_type'] == 'GUARD';
                  return _buildChatBubble(
                    sender: "${update['sender_name']} (${update['sender_type']})",
                    message: update['message'] ?? '',
                    photoUrl: update['photo_url'],
                    isMe: isGuard,
                    timestamp: update['created_at'] ?? '',
                  );
                }),
              ],
            ),
          ),
          if (!isResolved) _buildInputArea(),
          if (isResolved)
            Container(
              padding: const EdgeInsets.all(16),
              color: Colors.green.shade50,
              width: double.infinity,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle, color: Colors.green.shade700, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    "This ticket has been marked as RESOLVED by an Admin.",
                    style: TextStyle(color: Colors.green.shade800, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildChatBubble({
    required String sender,
    required String message,
    String? photoUrl,
    required bool isMe,
    required String timestamp,
  }) {
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(bottom: 14, left: isMe ? 48 : 0, right: isMe ? 0 : 48),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isMe ? const Color(0xFFDBEAFE) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isMe ? const Color(0xFFBFDBFE) : const Color(0xFFE2E8F0),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.between,
              children: [
                Text(
                  sender,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: isMe ? const Color(0xFF1E40AF) : Colors.grey.shade700,
                  ),
                ),
                Text(
                  timestamp.length >= 16 ? timestamp.substring(11, 16) : '',
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              message,
              style: const TextStyle(fontSize: 14, color: Color(0xFF0F172A)),
            ),
            _buildNetworkImage(photoUrl),
          ],
        ),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_selectedImage != null)
            Stack(
              children: [
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  height: 80,
                  width: 80,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    image: DecorationImage(image: FileImage(_selectedImage!), fit: BoxFit.cover),
                  ),
                ),
                Positioned(
                  right: -8,
                  top: -8,
                  child: IconButton(
                    icon: const Icon(Icons.cancel, color: Colors.red),
                    onPressed: () => setState(() => _selectedImage = null),
                  ),
                )
              ],
            ),
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.camera_alt, color: Color(0xFF1E3A8A)),
                onPressed: _pickImage,
              ),
              Expanded(
                child: TextField(
                  controller: _messageController,
                  decoration: InputDecoration(
                    hintText: "Add comment or update...",
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide.none,
                    ),
                    filled: true,
                    fillColor: const Color(0xFFF1F5F9),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  ),
                  maxLines: null,
                ),
              ),
              const SizedBox(width: 8),
              isPosting
                  ? const SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : CircleAvatar(
                      backgroundColor: const Color(0xFF1E3A8A),
                      radius: 20,
                      child: IconButton(
                        icon: const Icon(Icons.send, color: Colors.white, size: 18),
                        onPressed: _sendUpdate,
                      ),
                    ),
            ],
          ),
        ],
      ),
    );
  }
}