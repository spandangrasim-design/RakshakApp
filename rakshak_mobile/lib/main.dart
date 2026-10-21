import 'package:flutter/material.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const RakshakApp());
}

class RakshakApp extends StatelessWidget {
  const RakshakApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Rakshak Patrol',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.blue,
        visualDensity: VisualDensity.adaptivePlatformDensity,
      ),
      home: const LoginScreen(),
    );
  }
}