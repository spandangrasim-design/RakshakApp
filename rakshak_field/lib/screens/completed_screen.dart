import 'package:flutter/material.dart';

import '../util.dart';

class CompletedScreen extends StatelessWidget {
  final String routeName;
  final String? doneAt;

  const CompletedScreen({super.key, required this.routeName, this.doneAt});

  @override
  Widget build(BuildContext context) {
    final at = fmtTime(doneAt);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.check_circle, size: 96, color: Colors.green.shade600),
                const SizedBox(height: 16),
                const Text('Route completed',
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text(
                  '$routeName is done${at.isEmpty ? '' : ' at $at'}.\nOther guards can now see it as completed.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.black54, fontSize: 15),
                ),
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: FilledButton.styleFrom(minimumSize: const Size(220, 50)),
                  child: const Text('Back to routes'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
