import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';
import '../models/taste_label.dart';
import '../widgets/skeleton.dart';
import '../widgets/nex_notice.dart';
import '../widgets/taste_portrait.dart';

class TasteScreen extends ConsumerStatefulWidget {
  const TasteScreen({super.key});
  @override
  ConsumerState<TasteScreen> createState() => _TasteScreenState();
}

class _TasteScreenState extends ConsumerState<TasteScreen> {
  final search = TextEditingController();
  String polarity = 'All';
  bool learned = false, recent = false, loading = false;
  bool changingEngine = false;
  final pending = <String>{};
  final expandedGroups = <String>{};
  final groupLimits = <String, int>{};
  String? error;
  static const groups = {
    'genre': 'Genres',
    'keyword': 'Stories & themes',
    'story': 'Stories & themes',
    'theme': 'Stories & themes',
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
    final display = <Map<String, dynamic>>[];
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final e in filtered) {
      (grouped[groups[e['dimension']] ?? 'Other interests'] ??= []).add(e);
    }
    for (final section in grouped.entries) {
      display.add({'section': section.key, 'count': section.value.length});
      if (expandedGroups.contains(section.key) || query.isNotEmpty) {
        final limit = groupLimits[section.key] ?? 20;
        display.addAll(section.value.take(limit));
        if (section.value.length > limit) display.add({'more': section.key});
      }
    }
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
                    TastePortrait(
                      hasTaste: all.isNotEmpty,
                      fallback: [
                        if (favorites.isNotEmpty)
                          'You tend to enjoy ${favorites.toLowerCase()}.',
                        if (avoided.isNotEmpty)
                          'You prefer less of ${avoided.toLowerCase()}.',
                        'Open a topic below to shape what Nex looks for.',
                      ].join(' '),
                    ),
                    const SizedBox(height: 18),
                    if (!state.demoMode)
                      ExpansionTile(
                        backgroundColor: Theme.of(context)
                            .colorScheme
                            .surfaceContainerLow,
                        collapsedBackgroundColor: Theme.of(context)
                            .colorScheme
                            .surfaceContainerLow,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                        collapsedShape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                        leading: Icon(
                          Icons.tune,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                        childrenPadding: const EdgeInsets.all(16),
                        tilePadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 4,
                        ),
                        title: const Text('Recommendation settings'),
                        subtitle: const Text('Advanced · how picks are ranked'),
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
                        const Spacer(),
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
                      title: Text(
                        'Include learned patterns (${all.where((e) => !direct(e)).length})',
                      ),
                      subtitle: const Text(
                        'Tentative ideas from your ratings, not things you told us directly.',
                      ),
                      onChanged: (v) => setState(() => learned = v),
                    ),
                    Text(
                      '${filtered.length} preferences · ${recent ? 'recent first' : 'strongest first'}',
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                    if (polarity == 'Neutral')
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          '“No preference” tells Nex not to favour or avoid this topic. A Meh rating applies only to that title; it does not make all its topics neutral.',
                        ),
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
                itemCount: display.length,
                itemBuilder: (context, index) {
                  final e = display[index];
                  if (e['section'] case final String section) {
                    final open =
                        expandedGroups.contains(section) || query.isNotEmpty;
                    return Card(
                      child: ListTile(
                        title: Text(
                          section,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        subtitle: Text('${e['count']} preferences'),
                        trailing: Icon(
                          open ? Icons.expand_less : Icons.expand_more,
                        ),
                        onTap: () => setState(() {
                          if (open) {
                            expandedGroups.remove(section);
                            search.clear();
                          } else {
                            expandedGroups.add(section);
                          }
                        }),
                      ),
                    );
                  }
                  if (e['more'] case final String section) {
                    return TextButton(
                      onPressed: () => setState(
                        () => groupLimits[section] =
                            (groupLimits[section] ?? 20) + 20,
                      ),
                      child: Text('More in $section'),
                    );
                  }
                  final key = "${e['dimension']}:${e['key']}";
                  final score = e['score'] as num;
                  return Card(
                    key: ValueKey(key),
                    margin: const EdgeInsets.fromLTRB(14, 2, 8, 6),
                    child: ListTile(
                      dense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 2,
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
                            : 'From your ratings'}${e['exclude'] == true && score < 0 ? '\nExcluded from recommendations' : ''}${(e['conditions'] as List? ?? []).any((c) => c['dimension'] == 'country' && c['match'] == 'only') ? '\nCo-productions with other countries stay eligible' : ''}",
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
                              color: Theme.of(context)
                                  .colorScheme
                                  .surfaceContainerLow,
                              surfaceTintColor: Colors.transparent,
                              elevation: 8,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                                side: BorderSide(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .outlineVariant,
                                ),
                              ),
                              onSelected: (v) => change(e, v),
                              itemBuilder: (_) => const [
                                PopupMenuItem(
                                  value: 'like',
                                  child: ListTile(
                                    dense: true,
                                    leading: Icon(Icons.thumb_up_outlined),
                                    title: Text('More of this'),
                                  ),
                                ),
                                PopupMenuItem(
                                  value: 'dislike',
                                  child: ListTile(
                                    dense: true,
                                    leading: Icon(Icons.thumb_down_outlined),
                                    title: Text('Less of this'),
                                  ),
                                ),
                                PopupMenuItem(
                                  value: 'neutral',
                                  child: ListTile(
                                    dense: true,
                                    leading: Icon(Icons.remove_circle_outline),
                                    title: Text('No preference'),
                                  ),
                                ),
                                PopupMenuItem(
                                  value: 'remove',
                                  child: ListTile(
                                    dense: true,
                                    leading: Icon(Icons.delete_outline),
                                    title: Text('Forget this preference'),
                                  ),
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
