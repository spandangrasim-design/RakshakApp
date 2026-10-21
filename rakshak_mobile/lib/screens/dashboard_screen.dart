import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'login_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({Key? key}) : super(key: key);

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _guardName = 'Guard';
  bool _isShiftActive = false;

  @override
  void initState() {
    super.initState();
    _loadGuardData();
  }

  Future<void> _loadGuardData() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _guardName = prefs.getString('guard_name') ?? 'Security Guard';
    });
  }

  Future<void> _handleLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();

    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => const LoginScreen()),
    );
  }

  void _toggleShift() {
    setState(() {
      _isShiftActive = !_isShiftActive;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_isShiftActive ? 'Shift Started' : 'Shift Ended'),
        backgroundColor: _isShiftActive ? Colors.green : Colors.orange,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Rakshak Patrol', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: _handleLogout,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Welcome Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.grey.shade200),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: const Color(0xFF1E3A8A).withOpacity(0.1),
                    child: const Icon(Icons.person, size: 32, color: Color(0xFF1E3A8A)),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Welcome back,',
                          style: TextStyle(color: Colors.black54, fontSize: 13),
                        ),
                        Text(
                          _guardName,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Shift Status Banner
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: _isShiftActive ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _isShiftActive ? const Color(0xFFA7F3D0) : const Color(0xFFFDE68A),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    _isShiftActive ? Icons.check_circle : Icons.pause_circle_filled,
                    color: _isShiftActive ? Colors.green.shade700 : Colors.amber.shade800,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _isShiftActive ? 'Active Patrol Shift' : 'Off-Duty (No Active Shift)',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: _isShiftActive ? Colors.green.shade900 : Colors.amber.shade900,
                      ),
                    ),
                  ),
                  ElevatedButton(
                    onPressed: _toggleShift,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _isShiftActive ? Colors.red.shade600 : const Color(0xFF1E3A8A),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                    child: Text(_isShiftActive ? 'End Shift' : 'Start Shift'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),

            const Text(
              'Patrol Actions',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF334155)),
            ),
            const SizedBox(height: 12),

            // Action Grid
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 14,
              mainAxisSpacing: 14,
              children: [
                _buildActionCard(
                  icon: Icons.qr_code_scanner,
                  title: 'Scan Checkpoint',
                  subtitle: 'QR verification',
                  color: const Color(0xFF2563EB),
                  onTap: () {
                    // QR scanner routing will go here
                  },
                ),
                _buildActionCard(
                  icon: Icons.warning_amber_rounded,
                  title: 'Report Incident',
                  subtitle: 'Log security issue',
                  color: const Color(0xFFDC2626),
                  onTap: () {
                    // Incident reporting routing will go here
                  },
                ),
                _buildActionCard(
                  icon: Icons.map_outlined,
                  title: 'Patrol Route',
                  subtitle: 'Check assigned checkpoints',
                  color: const Color(0xFF0D9488),
                  onTap: () {
                    // Route details
                  },
                ),
                _buildActionCard(
                  icon: Icons.history,
                  title: 'Activity Log',
                  subtitle: 'Recent scans',
                  color: const Color(0xFF475569),
                  onTap: () {
                    // Logs view
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey.shade200),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 8,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: color.withOpacity(0.12),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF0F172A)),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: const TextStyle(fontSize: 12, color: Colors.black45),
            ),
          ],
        ),
      ),
    );
  }
}