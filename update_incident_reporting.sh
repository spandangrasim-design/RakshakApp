#!/bin/bash
set -e

echo "🚀 Updating incident reporting UX across rakshak_field..."

python3 - << 'PYEOF'
# ---------------------------------------------------------
# 1. incident_screen.dart: make checkpointName optional
# ---------------------------------------------------------
with open("rakshak_field/lib/screens/incident_screen.dart", "r", encoding="utf-8") as f:
    inc = f.read()

inc = inc.replace(
    "final String checkpointName;\n\n  const IncidentScreen({super.key, required this.checkpointName});",
    "final String? checkpointName;\n\n  const IncidentScreen({super.key, this.checkpointName});"
)

inc = inc.replace(
    "final _title = TextEditingController();\n  final _desc = TextEditingController();",
    "final _title = TextEditingController();\n  final _desc = TextEditingController();\n  final _location = TextEditingController();"
)

inc = inc.replace(
    "    _title.dispose();\n    _desc.dispose();",
    "    _title.dispose();\n    _desc.dispose();\n    _location.dispose();"
)

old_desc_payload = """    if (_fields.contains('description')) {
      final text = _desc.text.trim().isNotEmpty ? _desc.text.trim() : _title.text.trim();
      payload['description'] = '[${widget.checkpointName}] $text';
    }"""

new_desc_payload = """    if (_fields.contains('description')) {
      final text = _desc.text.trim().isNotEmpty ? _desc.text.trim() : _title.text.trim();
      final loc = (widget.checkpointName != null && widget.checkpointName!.trim().isNotEmpty)
          ? widget.checkpointName!.trim()
          : _location.text.trim();
      payload['description'] = loc.isNotEmpty ? '[$loc] $text' : text;
    }"""

assert old_desc_payload in inc, "Could not find description payload block in incident_screen.dart"
inc = inc.replace(old_desc_payload, new_desc_payload, 1)

# Add optional Location field right before the form fields if checkpointName is null
old_body_start = "appBar: AppBar(title: const Text('Report incident')),"
new_body_start = """appBar: AppBar(
        title: Text(
          widget.checkpointName != null && widget.checkpointName!.isNotEmpty
              ? 'Report incident · ${widget.checkpointName}'
              : 'Report incident',
        ),
      ),"""
if old_body_start in inc:
    inc = inc.replace(old_body_start, new_body_start, 1)

with open("rakshak_field/lib/screens/incident_screen.dart", "w", encoding="utf-8") as f:
    f.write(inc)
print("✅ Updated incident_screen.dart")

# ---------------------------------------------------------
# 2. run_screen.dart: remove post-scan prompt, add top AppBar button
# ---------------------------------------------------------
with open("rakshak_field/lib/screens/run_screen.dart", "r", encoding="utf-8") as f:
    run = f.read()

# Remove _askIncident helper method
old_ask_fn = """  Future<bool?> _askIncident(String checkpointName) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Any incident?'),
        content: Text('Did you notice anything wrong at "$checkpointName"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No, all clear')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Yes, report it')),
        ],
      ),
    );
  }

"""
assert old_ask_fn in run, "Could not find _askIncident in run_screen.dart"
run = run.replace(old_ask_fn, "", 1)

# Remove post-QR-scan incident prompt block
old_post_scan = """    _snack('"$cpName" verified');

    final fields = Session.formFields.where((f) => f != 'group');
    if (Session.can('report_incident') && fields.isNotEmpty) {
      final yes = await _askIncident(cpName);
      if (yes == true && mounted) {
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => IncidentScreen(checkpointName: cpName)),
        );
      }
    }"""

new_post_scan = """    _snack('"$cpName" verified');"""
assert old_post_scan in run, "Could not find post-scan incident block in run_screen.dart"
run = run.replace(old_post_scan, new_post_scan, 1)

# Add Report Incident button to AppBar actions in run_screen.dart
old_run_actions = """      appBar: AppBar(
        title: Text(widget.route['name'].toString()),
        actions: [
          if (!_starting && _error == null)"""

new_run_actions = """      appBar: AppBar(
        title: Text(widget.route['name'].toString()),
        actions: [
          if (Session.can('report_incident') && Session.formFields.where((f) => f != 'group').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: TextButton.icon(
                style: TextButton.styleFrom(
                  foregroundColor: Colors.red.shade700,
                  backgroundColor: Colors.red.shade50,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                ),
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => IncidentScreen(checkpointName: widget.route['name']?.toString()),
                    ),
                  );
                },
                icon: const Icon(Icons.report_problem_rounded, size: 18),
                label: const Text('Report', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),
            ),
          if (!_starting && _error == null)"""

assert old_run_actions in run, "Could not find AppBar actions in run_screen.dart"
run = run.replace(old_run_actions, new_run_actions, 1)

with open("rakshak_field/lib/screens/run_screen.dart", "w", encoding="utf-8") as f:
    f.write(run)
print("✅ Updated run_screen.dart (removed QR prompt + added top bar button)")

# ---------------------------------------------------------
# 3. scanner_screen.dart: add top AppBar Report Incident button
# ---------------------------------------------------------
with open("rakshak_field/lib/screens/scanner_screen.dart", "r", encoding="utf-8") as f:
    scan = f.read()

if "incident_screen.dart" not in scan:
    scan = scan.replace(
        "import 'package:mobile_scanner/mobile_scanner.dart';",
        "import 'package:mobile_scanner/mobile_scanner.dart';\n\nimport '../session.dart';\nimport 'incident_screen.dart';"
    )

old_scan_appbar = """      appBar: AppBar(
        title: const Text('Scan checkpoint QR', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
      ),"""

new_scan_appbar = """      appBar: AppBar(
        title: const Text('Scan checkpoint QR', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (Session.can('report_incident') && Session.formFields.where((f) => f != 'group').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: TextButton.icon(
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white,
                  backgroundColor: Colors.red.shade600,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                ),
                onPressed: () async {
                  await _stopScanner();
                  if (!context.mounted) return;
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const IncidentScreen()),
                  );
                  if (mounted && !_found) _startScanner();
                },
                icon: const Icon(Icons.report_problem_rounded, size: 18),
                label: const Text('Report Incident', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),
            ),
        ],
      ),"""

assert old_scan_appbar in scan, "Could not find AppBar in scanner_screen.dart"
scan = scan.replace(old_scan_appbar, new_scan_appbar, 1)

with open("rakshak_field/lib/screens/scanner_screen.dart", "w", encoding="utf-8") as f:
    f.write(scan)
print("✅ Updated scanner_screen.dart (added top bar Report Incident button)")

# ---------------------------------------------------------
# 4. routes_screen.dart (Homepage): add top bar button + Homepage card
# ---------------------------------------------------------
with open("rakshak_field/lib/screens/routes_screen.dart", "r", encoding="utf-8") as f:
    routes = f.read()

if "incident_screen.dart" not in routes:
    routes = routes.replace(
        "import 'onboarding_screen.dart';",
        "import 'incident_screen.dart';\nimport 'onboarding_screen.dart';"
    )

old_routes_actions = """        actions: [
          IconButton(onPressed: () => _load(), icon: const Icon(Icons.refresh)),"""

new_routes_actions = """        actions: [
          if (Session.can('report_incident') && Session.formFields.where((f) => f != 'group').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: TextButton.icon(
                style: TextButton.styleFrom(
                  foregroundColor: Colors.red.shade700,
                  backgroundColor: Colors.red.shade50,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                ),
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const IncidentScreen()),
                  );
                },
                icon: const Icon(Icons.report_problem_rounded, size: 18),
                label: const Text('Report', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),
            ),
          IconButton(onPressed: () => _load(), icon: const Icon(Icons.refresh)),"""

assert old_routes_actions in routes, "Could not find AppBar actions in routes_screen.dart"
routes = routes.replace(old_routes_actions, new_routes_actions, 1)

# Add a dedicated Homepage Report Incident banner card at top of body
old_routes_body = """      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _error != null && _routes.isEmpty"""

new_routes_body = """      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (Session.can('report_incident') && Session.formFields.where((f) => f != 'group').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 2),
                    child: Material(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(14),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const IncidentScreen()),
                          );
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.red.shade200),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.red.shade600,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: const Icon(Icons.report_problem_rounded, color: Colors.white, size: 22),
                              ),
                              const SizedBox(width: 12),
                              const Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Report an Incident',
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.black87),
                                    ),
                                    SizedBox(height: 2),
                                    Text(
                                      'Tap to log a safety, fire, security, or equipment issue anytime',
                                      style: TextStyle(fontSize: 12, color: Colors.black54),
                                    ),
                                  ],
                                ),
                              ),
                              Icon(Icons.chevron_right, color: Colors.red.shade700),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _load,
                    child: _error != null && _routes.isEmpty"""

assert old_routes_body in routes, "Could not find body RefreshIndicator in routes_screen.dart"
routes = routes.replace(old_routes_body, new_routes_body, 1)

old_routes_body_end = """                          itemBuilder: (_, i) => _RouteCard(route: _routes[i], onTap: () => _open(_routes[i])),
                        ),
            ),
    );
  }
}"""

new_routes_body_end = """                          itemBuilder: (_, i) => _RouteCard(route: _routes[i], onTap: () => _open(_routes[i])),
                        ),
                  ),
                ),
              ],
            ),
    );
  }
}"""

assert old_routes_body_end in routes, "Could not find body closing tags in routes_screen.dart"
routes = routes.replace(old_routes_body_end, new_routes_body_end, 1)

with open("rakshak_field/lib/screens/routes_screen.dart", "w", encoding="utf-8") as f:
    f.write(routes)
print("✅ Updated routes_screen.dart (added top bar button + Homepage Report Incident card)")
PYEOF

echo "🔍 Checking git diff summary..."
git status -s rakshak_field/lib/screens/
echo "✨ Done! Run 'cd rakshak_field && flutter analyze' or build your APK to verify."
