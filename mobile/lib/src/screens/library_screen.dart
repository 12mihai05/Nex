import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../state/app_controller.dart';
import '../widgets/content_card.dart';
import '../widgets/content_row.dart';

class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key, required this.watched});
  final bool watched;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    final keys = watched ? state.watched : state.watchlist;
    final items = controller.catalog
        .where((item) => keys.contains(item.key))
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(watched ? 'Seen library' : 'Want to see'),
        actions: [
          IconButton(
            tooltip: 'Find a title to add',
            icon: const Icon(Icons.add),
            onPressed: () => context.push('/search'),
          ),
        ],
      ),
      body: items.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      watched ? Icons.history : Icons.bookmark_outline,
                      size: 48,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      watched
                          ? 'Nothing marked watched yet.'
                          : 'Save movies and series you want to see.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 7),
                    Text(
                      watched
                          ? 'Marking history improves novelty without assuming you liked it.'
                          : 'Long-press any poster to save it here.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            )
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 180,
                childAspectRatio: .49,
                crossAxisSpacing: 14,
                mainAxisSpacing: 18,
              ),
              itemCount: items.length,
              itemBuilder: (_, index) => ContentCard(
                item: items[index],
                width: 160,
                onLongPress: () => showQuickActions(context, ref, items[index]),
              ),
            ),
    );
  }
}
