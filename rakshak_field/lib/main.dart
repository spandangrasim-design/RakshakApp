import 'package:flutter/material.dart';

import 'api.dart';
import 'screens/onboarding_screen.dart';
import 'screens/routes_screen.dart';
import 'session.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Session.load();

  // If the server ends this guard's access, drop back to the join screen from anywhere in the app.
  Api.onUnauthorized = () {
    navigatorKey.currentState?.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const OnboardingScreen()),
      (route) => false,
    );
  };

  runApp(const RakshakFieldApp());
}

class RakshakFieldApp extends StatelessWidget {
  const RakshakFieldApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Rakshak Field',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB)),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        appBarTheme: const AppBarTheme(centerTitle: false),
      ),
      home: Session.signedIn ? const RoutesScreen() : const OnboardingScreen(),
    );
  }
}
