import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import 'nex_notice.dart';

/// Factual national-chain listings. This is not a venue/showtime schedule.
class CinemaDetails extends StatelessWidget {
  const CinemaDetails({super.key, required this.data});
  final Map data;

  @override
  Widget build(BuildContext context) {
    final rows = (data['listings'] as List? ?? [])
        .whereType<Map>()
        .where((r) => r['status'] == 'listed' || r['status'] == 'upcoming')
        .toList();
    if (rows.isEmpty) return const SizedBox.shrink();
    final colors = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (index, row) in rows.indexed) ...[
            if (index > 0) const Divider(height: 24),
            Row(
              children: [
                Icon(Icons.theaters_outlined, color: colors.primary, size: 21),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        row['name'] as String? ?? 'Cinema',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _status(row),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Open cinema source',
                  icon: const Icon(Icons.open_in_new_rounded, size: 18),
                  onPressed: () =>
                      _open(context, row['sourceUrl'] as String? ?? ''),
                ),
              ],
            ),
          ],
          if (data['dateConflict'] == true)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                'The sources list different dates.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }

  String _status(Map row) {
    if (row['status'] == 'listed') return 'Listed at this cinema chain';
    final date = DateTime.tryParse(row['date'] as String? ?? '');
    final label = row['dateKind'] == 'reissue' ? 'Cinema run' : 'Expected';
    return date == null
        ? 'Date not listed yet'
        : '$label ${DateFormat.yMMMd().format(date)}';
  }

  Future<void> _open(BuildContext context, String value) async {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.userInfo.isNotEmpty ||
        (uri.hasPort && uri.port != 443) ||
        ![
          'www.cinemacity.ro',
          'cineplexx.ro',
          'www.cineplexx.ro',
        ].contains(uri.host)) {
      return;
    }
    for (final mode in [
      LaunchMode.externalApplication,
      LaunchMode.inAppBrowserView,
    ]) {
      try {
        if (await launchUrl(uri, mode: mode)) return;
      } catch (_) {
        /* Try browser fallback. */
      }
    }
    if (context.mounted) {
      showNexNotice(
        context,
        'Could not open the cinema website. Please try again.',
      );
    }
  }
}
