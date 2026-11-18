import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'services/sync_service.dart';
import 'theme/app_theme.dart';
import 'widgets/responsive.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SyncService().initialize();
  runApp(const RakshakApp());
}

class RakshakApp extends StatelessWidget {
  const RakshakApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Rakshak Patrol',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      builder: clampTextScale, // keeps layouts intact with very large system fonts
      home: const LoginScreen(),
    );
  }
}
