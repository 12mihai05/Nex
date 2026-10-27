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
    final colors = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Semantics(
            toggled: seen,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 44),
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 10,
                ),
                foregroundColor: seen ? colors.primary : colors.onSurface,
                backgroundColor: colors.surfaceContainerLow,
                side: BorderSide(color: seen ? colors.primary : colors.outline),
                shape: const StadiumBorder(),
              ),
              label: Text(seen ? 'Seen' : 'Mark as seen'),
              icon: Icon(
                seen
                    ? Icons.check_circle_rounded
                    : Icons.check_circle_outline_rounded,
                size: 19,
              ),
              onPressed: () => save(
                () => seen
                    ? controller.removeWatched(item)
                    : controller.markWatched(item),
              ),
            ),
          ),
        ),
        const SizedBox(height: 38),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final largeText =
                        MediaQuery.textScalerOf(context).scale(13) > 17;
                    final columns = constraints.maxWidth < 300 || largeText
                        ? 2
                        : 4;
                    final width =
                        (constraints.maxWidth - 8 * (columns - 1)) / columns;
                    return Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final option in const [
                          ('dislike', 'Dislike'),
                          ('meh', 'Meh'),
                          ('like', 'Like'),
                          ('super_like', 'Super Like'),
                        ])
                          SizedBox(
                            width: width,
                            child: Semantics(
                              selected: reaction == option.$1,
                              hint: reaction == option.$1
                                  ? 'Tap again to remove this rating'
                                  : null,
                              child: OutlinedButton(
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size(0, 40),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 4,
                                    vertical: 8,
                                  ),
                                  foregroundColor: reaction == option.$1
                                      ? colors.onPrimaryContainer
                                      : colors.onSurface,
                                  backgroundColor: reaction == option.$1
                                      ? colors.primaryContainer
                                      : colors.surfaceContainerLow,
                                  side: BorderSide(
                                    color: reaction == option.$1
                                        ? colors.primary
                                        : colors.outlineVariant,
                                  ),
                                  shape: const StadiumBorder(),
                                ),
                                onPressed: () => save(
                                  () => controller.react(
                                    item,
                                    reaction == option.$1 ? null : option.$1,
                                  ),
                                ),
                                child: Text(
                                  option.$2,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
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
