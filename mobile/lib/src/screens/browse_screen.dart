import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../models/content.dart';

import '../state/app_controller.dart';
import '../widgets/artwork.dart';
import '../widgets/content_row.dart';
import '../widgets/top_bar.dart';

class BrowseScreen extends ConsumerWidget {
  const BrowseScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    final hero = controller.browseHero;
    return Scaffold(
      appBar: const NexTopBar(),
      body: RefreshIndicator(
        onRefresh: () => _confirmRefresh(context, ref),
        child: CustomScrollView(
          key: const PageStorageKey('streaming-feed'),
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            if (state.busy)
              const SliverToBoxAdapter(child: LinearProgressIndicator()),
            if (state.error != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text(state.error!),
                ),
              ),
            if (hero != null)
              SliverToBoxAdapter(
                child: _Hero(
                  item: hero,
                  onPick: () => _showPickSheet(context, ref),
                ),
              )
            else
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'No matching picks yet. Try updating your services or taste.',
                  ),
                ),
              ),

            if (controller.recommendationsPending)
              SliverToBoxAdapter(
                child: TextButton.icon(
                  onPressed: state.busy
                      ? null
                      : () => _confirmRefresh(context, ref),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Taste updated · Refresh picks'),
                ),
              ),
            ...controller.browseRows.map(
              (row) => SliverToBoxAdapter(child: ContentShelf(row: row)),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 20)),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmRefresh(BuildContext context, WidgetRef ref) async {
    if (ref.read(appControllerProvider).busy) return;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (sheet) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              Icons.auto_awesome_outlined,
              size: 34,
              color: Theme.of(sheet).colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              'A fresh set of stories?',
              style: Theme.of(sheet).textTheme.headlineSmall,
            ),
            const SizedBox(height: 10),
            const Text(
              'Rebuild your shelves using your latest taste and services. Your current picks may move or change; saved titles stay safe.',
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.pop(sheet, true),
              child: const Text('Refresh my shelves'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(sheet, false),
              child: const Text('Keep these picks'),
            ),
          ],
        ),
      ),
    );
    if (confirmed == true && context.mounted) {
      await ref.read(appControllerProvider.notifier).refreshLive();
    }
  }

  Future<void> _showPickSheet(BuildContext context, WidgetRef ref) async {
    int? maxMinutes;
    String mood = 'Use my taste';
    final excluded = <int>{};
    ContentItem? pick;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) {
          final controller = ref.read(appControllerProvider.notifier);
          Future<void> choose() async {
            try {
              final next = await controller.pickLive(
                maxMinutes: maxMinutes,
                mood: mood,
                excluded: excluded,
              );
              if (context.mounted) setModalState(() => pick = next);
            } catch (_) {
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'No new pick matched. Try widening your filters.',
                    ),
                  ),
                );
              }
            }
          }

          return Padding(
            padding: EdgeInsets.fromLTRB(
              22,
              0,
              22,
              MediaQuery.viewInsetsOf(context).bottom + 24,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Pick for me',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 6),
                Text(
                  'One thoughtful answer. No endless grid.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 22),
                if (pick == null) ...[
                  Text(
                    'How much time?',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children:
                        [
                              (90, 'Under 90m'),
                              (120, 'Around 2h'),
                              (null, "Doesn’t matter"),
                            ]
                            .map(
                              (entry) => ChoiceChip(
                                label: Text(entry.$2),
                                selected: maxMinutes == entry.$1,
                                onSelected: (_) =>
                                    setModalState(() => maxMinutes = entry.$1),
                              ),
                            )
                            .toList(),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'What kind of mood?',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children:
                        [
                              'Use my taste',
                              'Light',
                              'Intense',
                              'Funny',
                              'Surprise me',
                            ]
                            .map(
                              (value) => ChoiceChip(
                                label: Text(value),
                                selected: mood == value,
                                onSelected: (_) =>
                                    setModalState(() => mood = value),
                              ),
                            )
                            .toList(),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: choose,
                    child: const Text('Make the pick'),
                  ),
                ] else ...[
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 120,
                        child: AspectRatio(
                          aspectRatio: 2 / 3,
                          child: Artwork(url: pick!.posterUrl),
                        ),
                      ),
                      const SizedBox(width: 18),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              pick!.title,
                              style: Theme.of(context).textTheme.headlineSmall,
                            ),
                            const SizedBox(height: 5),
                            Text(pick!.metadata),
                            const SizedBox(height: 13),
                            Text(controller.reasonFor(pick!)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () {
                      Navigator.pop(context);
                      context.push(
                        '/title/${pick!.mediaType.name}/${pick!.id}',
                        extra: pick,
                      );
                    },
                    child: const Text('Perfect — show details'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: () async {
                      excluded.add(pick!.id);
                      await controller.rejectPick(pick!);
                      await choose();
                    },
                    child: const Text('Another one'),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.item, required this.onPick});
  final ContentItem item;
  final VoidCallback onPick;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
    child: AspectRatio(
      aspectRatio: .86,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Artwork(url: item.backdropUrl, borderRadius: 0),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Color(0x22000000),
                    Color(0xF2080A0D),
                  ],
                  stops: [0, .48, 1],
                ),
              ),
            ),
            Positioned(
              left: 24,
              right: 24,
              bottom: 24,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: NexColors.ember,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'TOP PICK FOR YOU',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .8,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    item.title,
                    style: Theme.of(context).textTheme.displaySmall
                        ?.copyWith(color: Colors.white),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${item.metadata}\n${item.genres.take(3).join('  ·  ')}',
                    style: const TextStyle(color: Colors.white70, height: 1.5),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      FilledButton.icon(
                        onPressed: () => context.push(
                          '/title/${item.mediaType.name}/${item.id}',
                          extra: item,
                        ),
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: const Text('See why'),
                      ),
                      const SizedBox(width: 10),
                      IconButton.filledTonal(
                        tooltip: 'Pick for me',
                        onPressed: onPick,
                        icon: const Icon(Icons.shuffle_rounded),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
