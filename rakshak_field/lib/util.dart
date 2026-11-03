/// Local HH:mm from an ISO timestamp.
String fmtTime(String? iso) {
  if (iso == null) return '';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

/// Numbered label such as "2. Description".
String numbered(int index, String label) => '${index + 1}. $label';
