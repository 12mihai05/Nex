import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/chat_message.dart';
import 'nex_notice.dart';

class KnowledgeAnswer extends StatelessWidget {
  const KnowledgeAnswer({super.key, required this.block});
  final KnowledgeChatBlock block;
  @override
  Widget build(BuildContext context) {
    final spans = <InlineSpan>[];
    var position = 0;
    final citations = [...block.citations]
      ..sort((a, b) => (a['start'] as int).compareTo(b['start'] as int));
    for (final citation in citations) {
      final start = citation['start'] as int, end = citation['end'] as int;
      final uri = Uri.tryParse(citation['url'] as String);
      if (start < position ||
          end > block.text.length ||
          end < start ||
          uri == null ||
          uri.scheme != 'https' ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty) {
        continue;
      }
      spans.add(TextSpan(text: block.text.substring(position, start)));
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.middle,
          child: TextButton(
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              minimumSize: const Size(32, 32),
            ),
            onPressed: () async {
              try {
                if (await launchUrl(
                  uri,
                  mode: LaunchMode.externalApplication,
                )) {
                  return;
                }
              } catch (_) {}
              if (context.mounted) {
                showNexNotice(
                  context,
                  'Could not open this source. Please try again.',
                );
              }
            },
            child: Text(
              '[${citations.indexOf(citation) + 1}]',
              semanticsLabel: citation['title'] as String,
            ),
          ),
        ),
      );
      position = end;
    }
    spans.add(TextSpan(text: block.text.substring(position)));
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color,
        borderRadius: BorderRadius.circular(19),
      ),
      child: Text.rich(TextSpan(children: spans)),
    );
  }
}
