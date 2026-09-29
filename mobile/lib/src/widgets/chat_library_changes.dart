import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../models/chat_message.dart';
import 'artwork.dart';

class ChatLibraryChanges extends StatelessWidget {
  const ChatLibraryChanges({super.key, required this.block});
  final LibraryChangesChatBlock block;
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                block.saved
                    ? Icons.check_circle_rounded
                    : Icons.playlist_add_check_rounded,
                color: colors.primary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  block.saved ? 'Library updated' : 'Review your changes',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Text(
                '${block.items.length}',
                style: TextStyle(color: colors.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            block.saved
                ? 'Only the changes below were applied.'
                : 'Nothing saved yet. Check each title, then confirm below.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          for (var index = 0; index < block.items.length; index++) ...[
            if (index > 0)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1),
              ),
            _ChangeRow(item: block.items[index], index: index + 1),
          ],
        ],
      ),
    );
  }
}

class _ChangeRow extends StatelessWidget {
  const _ChangeRow({required this.item, required this.index});
  final LibraryChangeItem item;
  final int index;
  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Semantics(
        label: 'Open ${item.title}',
        button: true,
        child: InkWell(
          onTap: () => context.push('/title/${item.mediaType}/${item.id}'),
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 64,
            height: 96,
            child: Artwork(url: item.posterUrl, borderRadius: 12),
          ),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$index. ${item.title}',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 3),
            Text(
              [
                if (item.year != null) '${item.year}',
                item.mediaType == 'series' ? 'Series' : 'Movie',
              ].join(' · '),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: item.changes
                  .map(
                    (change) => Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Text(
                        change,
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context)
                              .colorScheme
                              .onPrimaryContainer,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
        ),
      ),
    ],
  );
}
