import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/content.dart';
import '../state/app_controller.dart';
import 'content_card.dart';
import 'title_feedback.dart';

class ContentShelf extends ConsumerWidget {
  const ContentShelf({super.key, required this.row});
  final ContentRow row;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
    padding: const EdgeInsets.only(bottom: 30),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(row.title, style: Theme.of(context).textTheme.titleLarge),
              if (row.subtitle != null) ...[
                const SizedBox(height: 3),
                Text(
                  row.subtitle!,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 284,
          child: ListView.separated(
            // Without a local storage key, every carousel inherits the feed's
            // saved offset. A new title set must also get a fresh position.
            key: PageStorageKey((
              row.title,
              row.items.map((i) => i.key).join(','),
            )),
            primary: false,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            scrollDirection: Axis.horizontal,
            itemCount: row.items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 13),
            itemBuilder: (_, index) {
              final item = row.items[index];
              return ContentCard(
                item: item,
                onLongPress: () => showQuickActions(context, ref, item),
              );
            },
          ),
        ),
      ],
    ),
  );
}

Future<void> showQuickActions(
  BuildContext context,
  WidgetRef ref,
  ContentItem item,
) => showModalBottomSheet<void>(
  context: context,
  showDragHandle: true,
  useSafeArea: true,
  isScrollControlled: true,
  builder: (context) => Consumer(
    builder: (context, ref, _) {
      final state = ref.watch(appControllerProvider);
      final controller = ref.read(appControllerProvider.notifier);
      final saved = state.watchlist.contains(item.key);
      return SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                item.title,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              TitleFeedback(item: item),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: Icon(
                  saved
                      ? Icons.bookmark_remove_outlined
                      : Icons.bookmark_add_outlined,
                ),
                label: Text(
                  saved ? 'Remove from Watchlist' : 'Add to Watchlist',
                ),
                onPressed: () => controller.toggleWatchlist(item),
              ),
            ],
          ),
        ),
      );
    },
  ),
);
