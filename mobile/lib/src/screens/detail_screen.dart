import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/content.dart';
import '../state/app_controller.dart';
import '../widgets/artwork.dart';
import '../widgets/title_feedback.dart';

class DetailScreen extends ConsumerWidget {
  const DetailScreen({super.key, required this.item});
  final ContentItem item;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    final saved = state.watchlist.contains(item.key);
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 320,
            pinned: true,
            stretch: true,
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  Artwork(url: item.backdropUrl, borderRadius: 0),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black12,
                          Colors.transparent,
                          Colors.black87,
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 36),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 7),
                  Text(
                    item.metadata,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: item.genres
                        .map((genre) => Chip(label: Text(genre)))
                        .toList(),
                  ),
                  const SizedBox(height: 22),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () => controller.toggleWatchlist(item),
                          icon: Icon(
                            saved ? Icons.bookmark : Icons.bookmark_outline,
                          ),
                          label: Text(saved ? 'In Watchlist' : 'Want to see'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  TitleFeedback(item: item),
                  const SizedBox(height: 28),
                  Text(
                    'The premise',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 9),
                  Text(
                    item.overview,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  TextButton(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: const Text('Source synopsis'),
                        content: Text(item.overview),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Close'),
                          ),
                        ],
                      ),
                    ),
                    child: const Text('Read source synopsis'),
                  ),
                  if (item.director != null || item.cast.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Text(
                      'Cast & crew',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      [
                        if (item.director != null)
                          'Directed by ${item.director}',
                        if (item.cast.isNotEmpty) item.cast.join(', '),
                      ].join('\n'),
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ],
                  const SizedBox(height: 28),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primaryContainer
                          .withValues(alpha: .45),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'WHY THIS',
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(
                                color: Theme.of(context).colorScheme.primary,
                              ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          controller.reasonFor(item),
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),
                  Text(
                    'Watch now',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 10),
                  if (item.availability.isEmpty)
                    const ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.info_outline),
                      title: Text('No provider availability reported'),
                    )
                  else
                    ...item.availability.map(
                      (availability) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          child: Text(
                            availability.providerName.characters.first,
                          ),
                        ),
                        title: Text(availability.providerName),
                        subtitle: Text(
                          availability.access == 'included' &&
                                  availability.owned
                              ? 'Included with your service'
                              : availability.access == 'rent'
                              ? 'Rent or buy'
                              : 'Subscription required · You don’t have this service',
                        ),
                        trailing: availability.owned
                            ? const Icon(Icons.check_circle_outline)
                            : null,
                      ),
                    ),
                  const SizedBox(height: 22),
                  Text('On TV', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.tv_outlined),
                    title: Text('No upcoming matched broadcasts'),
                    subtitle: Text(
                      'Nex only shows high-confidence EPG matches.',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
