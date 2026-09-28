import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../models/content.dart';

import '../state/app_controller.dart';
import '../widgets/artwork.dart';
import '../widgets/content_row.dart';
import '../widgets/top_bar.dart';
import '../widgets/skeleton.dart';
import '../widgets/catalog_filter_sheet.dart';
import '../data/api_client.dart';

class BrowseScreen extends ConsumerStatefulWidget {
  const BrowseScreen({super.key});
  @override
  ConsumerState<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends ConsumerState<BrowseScreen> {
  String type = 'any';
  String? genre, filterError;
  int? minimum, maximum;
  bool filtering = false;
  int generation = 0;
  List<ContentRow> filteredRows = [];
  final snapshots = <String, List<ContentRow>>{};
  bool get hasFilters =>
      type != 'any' || genre != null || minimum != null || maximum != null;
  String get filterKey => '$type:$genre:$minimum:$maximum';

  Future<void> loadFilters({bool force = false}) async {
    final ticket = ++generation;
    if (!hasFilters) {
      setState(() {
        filtering = false;
        filterError = null;
      });
      return;
    }
    final key = filterKey;
    if (!force && snapshots.containsKey(key)) {
      setState(() {
        filteredRows = snapshots[key]!;
        filtering = false;
        filterError = null;
      });
      return;
    }
    setState(() {
      filtering = true;
      filterError = null;
      filteredRows = [];
    });
    try {
      List<ContentRow> rows;
      if (ref.read(appControllerProvider).demoMode) {
        rows = ref
            .read(appControllerProvider.notifier)
            .browseRows
            .map(
              (r) => ContentRow(
                r.title,
                r.subtitle,
                r.items
                    .where(
                      (i) =>
                          (type == 'any' || i.mediaType.name == type) &&
                          (genre == null || i.genres.contains(genre)) &&
                          (minimum == null ||
                              (i.runtimeMinutes != null &&
                                  i.runtimeMinutes! >= minimum!)) &&
                          (maximum == null ||
                              (i.runtimeMinutes != null &&
                                  i.runtimeMinutes! <= maximum!)),
                    )
                    .toList(),
              ),
            )
            .where((r) => r.items.isNotEmpty)
            .toList();
      } else {
        final query = Uri(
          queryParameters: {
            'mediaType': type,
            'genre': ?genre,
            'minMinutes': ?minimum?.toString(),
            'maxMinutes': ?maximum?.toString(),
          },
        ).query;
        final data = await ref
            .read(nexApiClientProvider)
            .list('/api/discovery?$query');
        rows = data
            .map(
              (r) => ContentRow(
                r['title'] as String,
                r['subtitle'] as String?,
                (r['items'] as List)
                    .map(
                      (v) => ContentItem.fromJson(
                        ((v as Map)['item'] as Map).cast<String, dynamic>(),
                      ),
                    )
                    .toList(),
              ),
            )
            .toList();
      }
      if (!mounted || ticket != generation) return;
      if (snapshots.length >= 8) snapshots.remove(snapshots.keys.first);
      snapshots[key] = rows;
      setState(() => filteredRows = rows);
    } catch (e) {
      if (mounted && ticket == generation) {
        setState(() => filterError = readableApiError(e));
      }
    } finally {
      if (mounted && ticket == generation) setState(() => filtering = false);
    }
  }

  Future<void> editFilters() async {
    final value =
        await showModalBottomSheet<({String? genre, int? min, int? max})>(
          context: context,
          isScrollControlled: true,
          useSafeArea: true,
          showDragHandle: true,
          builder: (_) => CatalogFilterSheet(
            type: type,
            genre: genre,
            min: minimum,
            max: maximum,
          ),
        );
    if (value == null || !mounted) return;
    setState(() {
      genre = value.genre;
      minimum = value.min;
      maximum = value.max;
      if (minimum != null || maximum != null) type = 'movie';
    });
    await loadFilters();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    ref.listen(
      appControllerProvider.select(
        (s) => (
          s.country,
          (s.providers.toList()..sort()).join(','),
          s.authenticated,
          s.demoMode,
        ),
      ),
      (previous, next) {
        if (previous != next) {
          snapshots.clear();
          loadFilters();
        }
      },
    );
    final controller = ref.read(appControllerProvider.notifier);
    final rows = hasFilters ? filteredRows : controller.browseRows;
    final hero = hasFilters
        ? rows.firstOrNull?.items.firstOrNull
        : controller.browseHero;
    return Scaffold(
      appBar: const NexTopBar(),
      body: RefreshIndicator(
        onRefresh: () => _confirmRefresh(context, ref),
        child: CustomScrollView(
          key: const PageStorageKey('streaming-feed'),
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Wrap(
                  spacing: 8,
                  children: [
                    for (final entry in [
                      ('any', 'All'),
                      ('movie', 'Movies'),
                      ('series', 'Series'),
                    ])
                      ChoiceChip(
                        label: Text(entry.$2),
                        selected: type == entry.$1,
                        onSelected: (_) {
                          setState(() {
                            type = entry.$1;
                            genre = null;
                            minimum = null;
                            maximum = null;
                          });
                          loadFilters();
                        },
                      ),
                    ActionChip(
                      avatar: const Icon(Icons.tune, size: 18),
                      label: const Text('Filters'),
                      onPressed: editFilters,
                    ),
                    if (genre != null)
                      InputChip(
                        label: Text(genre!),
                        onDeleted: () {
                          setState(() => genre = null);
                          loadFilters();
                        },
                      ),
                    if (minimum != null || maximum != null)
                      InputChip(
                        label: Text('${minimum ?? 1}–${maximum ?? 'any'} min'),
                        onDeleted: () {
                          setState(() {
                            minimum = null;
                            maximum = null;
                          });
                          loadFilters();
                        },
                      ),
                  ],
                ),
              ),
            ),
            if (filtering || (state.busy && hero == null))
              const SliverToBoxAdapter(child: HomeSkeleton()),
            if (filterError != null)
              SliverToBoxAdapter(
                child: Column(
                  children: [
                    Text(filterError!),
                    TextButton(
                      onPressed: () => loadFilters(force: true),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
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
            else if (!filtering && !state.busy && filterError == null)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'No matching picks. Try a broader genre or duration range.',
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
            ...rows.map(
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
      snapshots.clear();
      if (hasFilters) {
        await loadFilters(force: true);
      } else {
        await ref.read(appControllerProvider.notifier).refreshLive();
      }
    }
  }

  Future<void> _showPickSheet(BuildContext context, WidgetRef ref) async {
    int? maxMinutes;
    String mood = 'Use my taste';
    final excluded = <int>{};
    ContentItem? pick;
    bool picking = false;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) {
          final controller = ref.read(appControllerProvider.notifier);
          Future<void> choose({bool another = false}) async {
            if (picking) return;
            setModalState(() => picking = true);
            try {
              if (another && pick != null) {
                excluded.add(pick!.id);
                await controller.rejectPick(pick!);
              }
              final next = await controller.pickLive(
                maxMinutes: maximum == null
                    ? maxMinutes
                    : maxMinutes == null
                    ? maximum
                    : (maximum! < maxMinutes! ? maximum : maxMinutes),
                minMinutes: minimum,
                mediaType: type,
                genre: genre,
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
            } finally {
              if (context.mounted) setModalState(() => picking = false);
            }
          }

          return SingleChildScrollView(
            child: Padding(
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
                  if (picking)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 20),
                      child: NexSkeleton(
                        child: Row(
                          children: [
                            SkeletonBlock(width: 120, height: 180),
                            SizedBox(width: 18),
                            Expanded(
                              child: Column(
                                children: [
                                  SkeletonBlock(height: 24),
                                  SizedBox(height: 12),
                                  SkeletonBlock(height: 14),
                                  SizedBox(height: 8),
                                  SkeletonBlock(height: 14),
                                  SizedBox(height: 8),
                                  SkeletonBlock(height: 14),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  if (!picking && pick == null) ...[
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
                                  onSelected: (_) => setModalState(
                                    () => maxMinutes = entry.$1,
                                  ),
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
                  ] else if (!picking && pick != null) ...[
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
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineSmall,
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
                      onPressed: () => choose(another: true),
                      child: const Text('Another one'),
                    ),
                  ],
                ],
              ),
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
