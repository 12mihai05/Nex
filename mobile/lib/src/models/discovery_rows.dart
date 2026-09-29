import 'content.dart';

List<ContentRow> parseDiscoveryRows(List<Map<String, dynamic>> data) => data
    .map(
      (r) => ContentRow(
        r['title'] as String,
        r['subtitle'] as String?,
        (r['items'] as List)
            .map(
              (v) => ContentItem.fromJson(
                ((v as Map)['item'] as Map).cast<String, dynamic>(),
              ),
            )
            .toList(),
        id: r['id'] as String?,
      ),
    )
    .toList();

// Append only: existing rows never move while the viewer is browsing.
List<ContentRow> appendDiscoveryRows(
  List<ContentRow> current,
  List<ContentRow> incoming,
) {
  final result = [...current];
  final counts = <String, int>{};
  for (final row in current) {
    for (final item in row.items) {
      counts.update(item.key, (n) => n + 1, ifAbsent: () => 1);
    }
  }
  for (final row in incoming) {
    if (result.any((r) => r.title == row.title)) continue;
    final items = row.items.where((i) => (counts[i.key] ?? 0) < 3).toList();
    if (items.isEmpty ||
        result.any(
          (r) =>
              items.where((i) => r.items.any((j) => j.key == i.key)).length /
                  (r.items.length > items.length
                      ? r.items.length
                      : items.length) >
              .85,
        )) {
      continue;
    }
    result.add(ContentRow(row.title, row.subtitle, items, id: row.id));
    for (final item in items) {
      counts.update(item.key, (n) => n + 1, ifAbsent: () => 1);
    }
  }
  return result;
}
