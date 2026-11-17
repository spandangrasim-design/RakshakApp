import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'rakshak_theme.dart';
import 'services/sync_service.dart'; // Add this import

void main() {
  // Ensure native background channels are ready before the app starts
  WidgetsFlutterBinding.ensureInitialized();
  
  // Start the background network listener for the offline queue
  SyncService().initialize();

  runApp(const RakshakApp());
}

class RakshakApp extends StatelessWidget {
  const RakshakApp({super.key}); // Updated to modern super.key syntax

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Rakshak Patrol',
      debugShowCheckedModeBanner: false,
      theme: RakshakTheme.light(),
      home: const LoginScreen(),
    );
  }
}
