import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/content.dart';
import '../state/app_controller.dart';

/// Viewing history and opinion are deliberately independent.
class TitleFeedback extends ConsumerStatefulWidget {
  const TitleFeedback({super.key, required this.item});
  final ContentItem item;
  @override
  ConsumerState<TitleFeedback> createState() => _TitleFeedbackState();
}

class _TitleFeedbackState extends ConsumerState<TitleFeedback> {
  Future<void> save(Future<void> Function() action) => action();

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    final seen = state.watched.contains(item.key);
    final reaction = state.reactions[item.key];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FilterChip(
          label: Text(seen ? 'Seen' : 'Mark as seen'),
          avatar: Icon(
            seen ? Icons.check_circle : Icons.check_circle_outline,
            size: 18,
          ),
          selected: seen,
          onSelected: (value) => save(
            () => value
                ? controller.markWatched(item)
                : controller.removeWatched(item),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          seen
              ? 'Your opinion · optional'
              : 'Viewing status unspecified. You can still rate it.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final entry in const {
              'like': 'Like',
              'dislike': 'Dislike',
              'meh': 'Meh',
              'super_like': 'Super Like',
            }.entries)
              ChoiceChip(
                label: Text(entry.value),
                selected: reaction == entry.key,
                onSelected: (selected) => save(
                  () => controller.react(item, selected ? entry.key : null),
                ),
              ),
          ],
        ),
        if (reaction != null)
          TextButton(
            onPressed: () => save(() => controller.react(item, null)),
            child: const Text('Clear opinion'),
          ),
        if (state.error != null)
          Text(
            state.error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
      ],
    );
  }
}
