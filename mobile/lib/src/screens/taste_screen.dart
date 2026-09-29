import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';
import '../models/taste_label.dart';
import '../widgets/skeleton.dart';
import '../widgets/nex_notice.dart';

class TasteScreen extends ConsumerStatefulWidget {
  const TasteScreen({super.key});
  @override
  ConsumerState<TasteScreen> createState() => _TasteScreenState();
}

class _TasteScreenState extends ConsumerState<TasteScreen> {
  final scroll = ScrollController();
  int visible = 24;
  bool loading = false;
  String? error;
  @override
  void initState() {
    super.initState();
    scroll.addListener(() {
      if (scroll.position.extentAfter < 500 && visible < entries.length) {
        setState(() => visible += 24);
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && entries.isEmpty) refresh();
    });
  }

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get entries {
    final state = ref.read(appControllerProvider);
    if (!state.demoMode) {
      return ref.read(appControllerProvider.notifier).tasteEntries;
    }
    return [
      for (final key in {...state.moods, ...state.genres})
        {
          'key': key,
          'dimension': 'mood',
          'score': .8,
          'confidence': .8,
          'source': 'onboarding_explicit',
        },
      for (final key in ['Musicals', 'Heavy gore'])
        {
          'key': key,
          'dimension': 'keyword',
          'score': -.8,
          'confidence': .8,
          'source': 'onboarding_explicit',
        },
    ];
  }

  Future<void> refresh() async {
    if (loading) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await ref.read(appControllerProvider.notifier).refreshTasteView();
    } catch (_) {
      if (mounted) error = 'Could not refresh your preferences. Your cached taste is still available.';
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    final all = entries;
    final count = all.length < visible ? all.length : visible;
    return Scaffold(
      appBar: AppBar(title: const Text('Your Taste')),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView.builder(
          controller: scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          itemCount:
              1 +
              count +
              (loading ? (MediaQuery.sizeOf(context).height / 92).ceil() : 1),
          itemBuilder: (context, index) {
            if (index == 0) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Personalization you can understand.',
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'These are durable preferences. What you want tonight lives separately and expires.',
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 18),
                  OutlinedButton.icon(
                    onPressed: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      showDragHandle: true,
                      builder: (_) =>
                          _EditTaste(state: state, controller: controller),
                    ),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Edit preferences'),
                  ),
                  const SizedBox(height: 18),
                  if (error != null)
                    TextButton(
                      onPressed: refresh,
                      child: Text('$error Tap to retry.'),
                    ),
                ],
              );
            }
            if (index > count) {
              if (loading) {
                return const Padding(
                  padding: EdgeInsets.only(bottom: 10),
                  child: NexSkeleton(child: _TasteCardSkeleton()),
                );
              }
              if (all.isEmpty) {
                return const Text(
                  'Tell Nex what you enjoy, or edit your preferences above.',
                );
              }
              if (count < all.length) {
                return TextButton(
                  onPressed: () => setState(() => visible += 24),
                  child: const Text('More preferences'),
                );
              }
              return const SizedBox(height: 20);
            }
            final entry = all[index - 1];
            final score = entry['score'] as num;
            final tentative = (entry['confidence'] as num) < .35;
            final label = score == 0
                ? 'No preference'
                : score > 0
                ? 'You tend to enjoy'
                : 'Usually not your thing';
            final direct = const [
              'chat_explicit',
              'explicit_edit',
              'onboarding_explicit',
              'onboarding_text',
            ].contains(entry['source']);
            return Card(
              key: ValueKey('${entry['dimension']}:${entry['key']}'),
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                leading: Icon(
                  score < 0
                      ? Icons.thumb_down_outlined
                      : score > 0
                      ? Icons.thumb_up_outlined
                      : Icons.remove_rounded,
                  color: Theme.of(context).colorScheme.primary,
                ),
                title: Text(tasteLabel(entry)),
                subtitle: Text(
                  '$label · ${direct
                      ? 'You told Nex'
                      : tentative
                      ? 'Tentative signal'
                      : 'Learned preference'}',
                ),
                trailing: state.demoMode
                    ? null
                    : PopupMenuButton<double>(
                        tooltip: 'Correct this preference',
                        onSelected: (value) async {
                          try {
                            await controller.correctTaste(
                              entry['dimension'] as String,
                              entry['key'] as String,
                              value,
                            );
                          } catch (_) {
                            if (context.mounted) {
                              showNexNotice(
                                context,
                                'Could not save this preference. Please try again.',
                              );
                            }
                          }
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: 1, child: Text('I prefer this')),
                          PopupMenuItem(value: -1, child: Text('Avoid this')),
                          PopupMenuItem(value: 0, child: Text('No preference')),
                        ],
                      ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _TasteCardSkeleton extends StatelessWidget {
  const _TasteCardSkeleton();
  @override
  Widget build(BuildContext context) => Container(
    constraints: const BoxConstraints(minHeight: 88),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Theme.of(context).cardTheme.color,
      borderRadius: BorderRadius.circular(20),
    ),
    child: const Row(
      children: [
        SkeletonBlock(height: 24, width: 24, radius: 8),
        SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonBlock(height: 18, width: 170),
              SizedBox(height: 8),
              SkeletonBlock(height: 14, width: 230),
            ],
          ),
        ),
        SizedBox(width: 20),
      ],
    ),
  );
}

class _EditTaste extends StatefulWidget {
  const _EditTaste({required this.state, required this.controller});
  final AppState state;
  final AppController controller;
  @override
  State<_EditTaste> createState() => _EditTasteState();
}

class _EditTasteState extends State<_EditTaste> {
  late Set<String> moods = {...widget.state.moods};
  late Set<String> genres = {...widget.state.genres};
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Edit preferences',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 18),
        Text('Moods', style: Theme.of(context).textTheme.titleLarge),
        Wrap(
          spacing: 8,
          children:
              [
                    'Cerebral',
                    'Tense',
                    'Dark',
                    'Feel-good',
                    'Cozy',
                    'Funny',
                    'Emotional',
                    'Intense',
                    'Weird',
                    'Slow-burn',
                  ]
                  .map(
                    (value) => FilterChip(
                      label: Text(value),
                      selected: moods.contains(value),
                      onSelected: (_) => setState(
                        () => moods.contains(value)
                            ? moods.remove(value)
                            : moods.add(value),
                      ),
                    ),
                  )
                  .toList(),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: () async {
            await widget.controller.saveTaste(genres, moods);
            if (context.mounted) Navigator.pop(context);
          },
          child: const Text('Save strong preference correction'),
        ),
      ],
    ),
  );
}
