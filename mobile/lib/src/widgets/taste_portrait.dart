import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../state/app_controller.dart';
import 'nex_notice.dart';
import 'skeleton.dart';

class TastePortrait extends ConsumerStatefulWidget {
  const TastePortrait({
    super.key,
    required this.fallback,
    required this.hasTaste,
  });
  final String fallback;
  final bool hasTaste;
  @override
  ConsumerState<TastePortrait> createState() => _TastePortraitState();
}

class _TastePortraitState extends ConsumerState<TastePortrait> {
  Map<String, dynamic> saved = {};
  bool busy = false;
  @override
  void initState() {
    super.initState();
    if (!ref.read(appControllerProvider).demoMode) {
      ref
          .read(nexApiClientProvider)
          .object('/api/me/taste-summary')
          .then((value) {
            if (mounted) setState(() => saved = value);
          })
          .catchError((Object _) {
            /* A summary never blocks editing Taste. */
          });
    }
  }

  Future<void> generate() async {
    setState(() => busy = true);
    try {
      final result = await ref
          .read(nexApiClientProvider)
          .generateTasteSummary();
      if (mounted) setState(() => saved = result);
    } catch (_) {
      if (mounted) {
        showNexNotice(
          context,
          'Could not update your summary. Your Taste is unchanged.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final next = DateTime.tryParse(saved['nextRefreshAt'] as String? ?? '');
    final date = DateTime.tryParse(saved['updatedAt'] as String? ?? '');
    final cooling = next?.isAfter(DateTime.now()) ?? false;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome_outlined, color: scheme.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Your viewing taste',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (busy)
            const NexSkeleton(
              child: Column(
                children: [
                  SkeletonBlock(height: 14),
                  SizedBox(height: 9),
                  SkeletonBlock(height: 14),
                  SizedBox(height: 9),
                  SkeletonBlock(height: 14),
                ],
              ),
            )
          else
            Text(
              widget.hasTaste
                  ? saved['paragraph'] as String? ?? widget.fallback
                  : 'Tell Nex what you enjoy, or rate a few titles. Your viewing preferences will take shape here.',
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(height: 1.55),
            ),
          const SizedBox(height: 12),
          if (date != null && widget.hasTaste)
            Text(
              'AI summary · ${DateFormat.yMMMd().format(date.toLocal())} · saved snapshot',
              style: Theme.of(context).textTheme.labelSmall,
            ),
          if (!ref.read(appControllerProvider).demoMode && widget.hasTaste) ...[
            TextButton.icon(
              onPressed: busy || cooling ? null : generate,
              icon: const Icon(Icons.auto_awesome, size: 18),
              label: Text(
                saved['paragraph'] == null
                    ? 'Describe my taste'
                    : 'Refresh summary',
              ),
            ),
            Text(
              cooling
                  ? 'Summary refresh available ${DateFormat.MMMd().add_Hm().format(next!.toLocal())}. Your recommendations already use your latest Taste.'
                  : 'Generated only when you ask, at most once a day. This summary does not control your recommendations.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}
