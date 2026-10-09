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
  final search = TextEditingController();
  String polarity = 'All', group = 'All topics';
  bool learned = false, recent = false, loading = false;
  bool changingEngine = false;
  final pending = <String>{};
  String? error;
  static const groups = {
    'genre': 'Genres',
    'keyword': 'Stories & themes',
    'story': 'Stories & themes',
    'mood': 'Mood & pace',
    'combination': 'Specific combinations',
    'actor': 'People',
    'director': 'People',
    'language': 'Languages & countries',
    'country': 'Languages & countries',
    'decade': 'Eras',
    'format': 'Formats',
    'franchise': 'Collections',
  };
  bool direct(Map<String, dynamic> e) => const [
    'chat_explicit',
    'explicit_edit',
    'onboarding_explicit',
    'onboarding_text',
  ].contains(e['source']);

  List<Map<String, dynamic>> get entries {
    final state = ref.read(appControllerProvider);
    if (!state.demoMode) {
      return ref.read(appControllerProvider.notifier).tasteEntries;
    }
    return [
      for (final key in {...state.moods, ...state.genres})
        {
          'key': key,
          'dimension': state.genres.contains(key) ? 'genre' : 'mood',
          'score': .8,
          'confidence': .8,
          'source': 'onboarding_explicit',
        },
    ];
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) refresh();
    });
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
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
      error = 'Could not refresh. Your saved preferences are still available.';
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> change(Map<String, dynamic> e, String action) async {
    final key = "${e['dimension']}:${e['key']}";
    if (pending.contains(key)) return;
    setState(() => pending.add(key));
    try {
      final controller = ref.read(appControllerProvider.notifier);
      if (action == 'remove') {
        await controller.removeTaste(
          e['dimension'] as String,
          e['key'] as String,
        );
      } else {
        await controller.correctTaste(
          e['dimension'] as String,
          e['key'] as String,
          action == 'like'
              ? 1
              : action == 'dislike'
              ? -1
              : 0,
        );
      }
    } catch (_) {
      if (mounted) showNexNotice(context, 'Could not save. Please try again.');
    } finally {
      if (mounted) setState(() => pending.remove(key));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    final all = entries, query = search.text.trim().toLowerCase();
    final filtered = all.where((e) {
      final score = (e['score'] as num).toDouble();
      return (learned || direct(e) || query.isNotEmpty) &&
          (polarity == 'All' ||
              (polarity == 'More of'
                  ? score > 0
                  : polarity == 'Less of'
                  ? score < 0
                  : score == 0)) &&
          (group == 'All topics' || groups[e['dimension']] == group) &&
          (query.isEmpty || tasteLabel(e).toLowerCase().contains(query));
    }).toList();
    filtered.sort((a, b) {
      if (recent) {
        return (b['lastEvidenceAt']?.toString() ?? '').compareTo(
          a['lastEvidenceAt']?.toString() ?? '',
        );
      }
      final av = (a['score'] as num).abs() * (a['confidence'] as num);
      final bv = (b['score'] as num).abs() * (b['confidence'] as num);
      return bv.compareTo(av);
    });
    final favorites = all
        .where((e) => direct(e) && (e['score'] as num) > 0)
        .take(3)
        .map(tasteLabel)
        .join(', ');
    final avoided = all
        .where((e) => direct(e) && (e['score'] as num) < 0)
        .take(3)
        .map(tasteLabel)
        .join(', ');
    return Scaffold(
      appBar: AppBar(title: const Text('Your Taste')),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'What makes a good watch for you',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 12),
                    if (favorites.isNotEmpty) Text('More of: $favorites.'),
                    if (avoided.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text('Less of: $avoided.'),
                      ),
                    const SizedBox(height: 10),
                    const Text(
                      'Your choices guide Nex, not limit you. Preferences you tell us come first. You can change or forget any of them.',
                    ),
                    const SizedBox(height: 18),
                    if (!state.demoMode)
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: const Text('Recommendation test'),
                        subtitle: const Text('Compare how Nex chooses for you'),
                        children: [
                          const Text(
                            'Your saved Taste stays the same. Change the method, then refresh Home to compare. Pick for me uses your choice immediately. Extra AI work may take longer on the first load.',
                          ),
                          const SizedBox(height: 12),
                          for (final option in const {
                            'baseline': 'Classic · current method',
                            'semantic': 'Story matching · experimental',
                            'semantic_ai':
                                'Story matching + AI review · experimental',
                          }.entries)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              selected:
                                  state.recommendationEngine == option.key,
                              title: Text(option.value),
                              leading: Icon(
                                state.recommendationEngine == option.key
                                    ? Icons.radio_button_checked
                                    : Icons.radio_button_off,
                              ),
                              enabled: !changingEngine,
                              onTap: () async {
                                if (state.recommendationEngine == option.key) {
                                  return;
                                }
                                setState(() => changingEngine = true);
                                try {
                                  await ref
                                      .read(appControllerProvider.notifier)
                                      .setRecommendationEngine(option.key);
                                  if (context.mounted) {
                                    showNexNotice(
                                      context,
                                      'Saved. Refresh Home to try it.',
                                    );
                                  }
                                } catch (_) {
                                  if (context.mounted) {
                                    showNexNotice(
                                      context,
                                      'Could not save. Please try again.',
                                    );
                                  }
                                } finally {
                                  if (mounted) {
                                    setState(() => changingEngine = false);
                                  }
                                }
                              },
                            ),
                          if (changingEngine) const LinearProgressIndicator(),
                          const SizedBox(height: 12),
                        ],
                      ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: search,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        hintText: 'Find a preference',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: search.text.isEmpty
                            ? null
                            : IconButton(
                                tooltip: 'Clear search',
                                icon: const Icon(Icons.close),
                                onPressed: () {
                                  search.clear();
                                  setState(() {});
                                },
                              ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final value in [
                          'All',
                          'More of',
                          'Less of',
                          'Neutral',
                        ])
                          ChoiceChip(
                            label: Text(value),
                            selected: polarity == value,
                            onSelected: (_) => setState(() => polarity = value),
                          ),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButton<String>(
                            value: group,
                            isExpanded: true,
                            items: [
                              for (final value in [
                                'All topics',
                                ...groups.values.toSet(),
                              ])
                                DropdownMenuItem(
                                  value: value,
                                  child: Text(value),
                                ),
                            ],
                            onChanged: (v) => setState(() => group = v!),
                          ),
                        ),
                        const SizedBox(width: 12),
                        IconButton(
                          tooltip: recent
                              ? 'Sort by strongest preference'
                              : 'Sort by recently learned',
                          isSelected: recent,
                          icon: const Icon(Icons.history),
                          onPressed: () => setState(() => recent = !recent),
                        ),
                      ],
                    ),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      value: learned,
                      title: const Text('Include learned patterns'),
                      subtitle: const Text(
                        'Tentative ideas from your ratings, not things you told us directly.',
                      ),
                      onChanged: (v) => setState(() => learned = v),
                    ),
                    Text(
                      '${filtered.length} preferences · ${recent ? 'recent first' : 'strongest first'}',
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                    if (error != null)
                      TextButton(onPressed: refresh, child: Text(error!)),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              sliver: SliverList.builder(
                itemCount: filtered.length,
                itemBuilder: (context, index) {
                  final e = filtered[index],
                      key = "${e['dimension']}:${e['key']}";
                  final score = e['score'] as num;
                  return Card(
                    key: ValueKey(key),
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      leading: Icon(
                        score > 0
                            ? Icons.thumb_up_outlined
                            : score < 0
                            ? Icons.thumb_down_outlined
                            : Icons.remove,
                      ),
                      title: Text(tasteLabel(e)),
                      subtitle: Text(
                        "${groups[e['dimension']] ?? 'Other interests'} · ${direct(e)
                            ? 'You told Nex'
                            : (e['confidence'] as num) < .35
                            ? 'Still learning'
                            : 'From your ratings'}",
                      ),
                      trailing: pending.contains(key)
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : state.demoMode
                          ? null
                          : PopupMenuButton<String>(
                              tooltip: 'Change preference',
                              onSelected: (v) => change(e, v),
                              itemBuilder: (_) => const [
                                PopupMenuItem(
                                  value: 'like',
                                  child: Text('More of this'),
                                ),
                                PopupMenuItem(
                                  value: 'dislike',
                                  child: Text('Less of this'),
                                ),
                                PopupMenuItem(
                                  value: 'neutral',
                                  child: Text('No preference'),
                                ),
                                PopupMenuItem(
                                  value: 'remove',
                                  child: Text('Forget this preference'),
                                ),
                              ],
                            ),
                    ),
                  );
                },
              ),
            ),
            if (loading && all.isEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                sliver: SliverList.builder(
                  itemCount: (MediaQuery.sizeOf(context).height / 100).ceil(),
                  itemBuilder: (_, _) => const Padding(
                    padding: EdgeInsets.only(bottom: 10),
                    child: NexSkeleton(child: _TasteCardSkeleton()),
                  ),
                ),
              ),
            if (!loading && filtered.isEmpty)
              const SliverPadding(
                padding: EdgeInsets.all(24),
                sliver: SliverToBoxAdapter(
                  child: Text(
                    'No preferences here yet. Tell Nex what you enjoy in Chat, or include learned patterns.',
                  ),
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 32)),
          ],
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
