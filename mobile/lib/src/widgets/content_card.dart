import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';

import '../models/content.dart';
import '../core/theme.dart';
import 'artwork.dart';

class ContentCard extends ConsumerWidget {
  const ContentCard({
    super.key,
    required this.item,
    this.width = 144,
    this.onLongPress,
  });
  final ContentItem item;
  final double width;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(
      appControllerProvider.select((s) => s.watchlist.contains(item.key)),
    );
    final available = item.bestAvailability;
    final seen = ref.watch(
      appControllerProvider.select((s) => s.watched.contains(item.key)),
    );
    return Semantics(
      button: true,
      label:
          '${item.title}. ${item.metadata}. ${available?.providerName ?? 'Availability unknown'}',
      child: SizedBox(
        width: width,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => context.push(
            '/title/${item.mediaType.name}/${item.id}',
            extra: item,
          ),
          onLongPress: onLongPress,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Flexible(
                child: AspectRatio(
                  aspectRatio: 2 / 3,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Artwork(url: item.posterUrl),
                      if (seen)
                        Positioned(
                          top: 8,
                          left: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: .8),
                              borderRadius: BorderRadius.circular(9),
                            ),
                            child: const Text(
                              'Seen',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ),
                      if (saved)
                        const Positioned(
                          top: 8,
                          right: 8,
                          child: Tooltip(
                            message: 'Want to see',
                            child: CircleAvatar(
                              radius: 15,
                              backgroundColor: NexColors.ember,
                              child: Icon(
                                Icons.bookmark,
                                color: Colors.white,
                                size: 18,
                              ),
                            ),
                          ),
                        ),
                      if (available != null)
                        Positioned(
                          left: 8,
                          bottom: 8,
                          child: _AvailabilityPill(availability: available),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                item.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelLarge,
              ),
              if (item.metadata.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  item.metadata,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _AvailabilityPill extends StatelessWidget {
  const _AvailabilityPill({required this.availability});
  final Availability availability;
  @override
  Widget build(BuildContext context) => Container(
    constraints: const BoxConstraints(maxWidth: 122),
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(
      color: availability.owned && availability.access == 'included'
          ? NexColors.moss.withValues(alpha: .94)
          : Colors.black.withValues(alpha: .78),
      borderRadius: BorderRadius.circular(9),
    ),
    child: Text(
      availability.access == 'included' && availability.owned
          ? availability.providerName
          : availability.access == 'rent'
          ? 'Rent · ${availability.providerName}'
          : '${availability.providerName} · not owned',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: availability.owned && availability.access == 'included'
            ? const Color(0xFF172016)
            : Colors.white,
        fontSize: 10.5,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}
