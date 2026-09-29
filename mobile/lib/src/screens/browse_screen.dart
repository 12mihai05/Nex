import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../models/content.dart';
import '../models/discovery_rows.dart';

import '../state/app_controller.dart';
import '../widgets/artwork.dart';
import '../widgets/content_row.dart';
import '../widgets/top_bar.dart';
import '../widgets/skeleton.dart';
import '../widgets/catalog_filter_sheet.dart';
import '../widgets/streaming_service_chips.dart';
import '../widgets/title_extras.dart';
import '../data/api_client.dart';

class BrowseScreen extends ConsumerStatefulWidget {
  const BrowseScreen({super.key});
  @override
  ConsumerState<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends ConsumerState<BrowseScreen> {
  String type = 'any';
  String watchStatus = 'new';
  Set<int>? providers;
  String? get providerQuery =>
      providers == null ? null : (providers!.toList()..sort()).join(',');
  String? genre, filterError;
  int? minimum, maximum;
  bool filtering = false;
  int generation = 0;
  List<ContentRow> filteredRows = [];
  final snapshots = <String, List<ContentRow>>{};
  final batchPositions = <String, int>{};
  int nextBatch = 1;
  bool loadingMore = false;
  String? moreError;

  Future<void> loadMore() async {
    if (!hasFilters) {
      await ref.read(appControllerProvider.notifier).loadMoreHome();
      return;
    }
    if (filtering ||
        loadingMore ||
        nextBatch >= 6 ||
        ref.read(appControllerProvider).demoMode) {
      return;
    }
    final ticket = generation;
    final key = filterKey;
    setState(() {
      loadingMore = true;
      moreError = null;
    });
    try {
      final query = Uri(
        queryParameters: {
          'batch': '$nextBatch',
          'mediaType': type,
          'watchStatus': watchStatus,
          'providerIds': ?providerQuery,
          'genre': ?genre,
          'minMinutes': ?minimum?.toString(),
          'maxMinutes': ?maximum?.toString(),
        },
      ).query;
      final data = await ref
          .read(nexApiClientProvider)
          .list('/api/discovery?$query');
      if (!mounted || ticket != generation) return;
      setState(() {
        filteredRows = appendDiscoveryRows(
          filteredRows,
          parseDiscoveryRows(data),
        );
        nextBatch++;
        snapshots[key] = filteredRows;
        batchPositions[key] = nextBatch;
      });
    } catch (e) {
      if (mounted && ticket == generation) {
        setState(() => moreError = readableApiError(e));
      }
    } finally {
      if (mounted && ticket == generation) setState(() => loadingMore = false);
    }
  }

  bool get hasFilters =>
      type != 'any' ||
      genre != null ||
      minimum != null ||
      maximum != null ||
      watchStatus != 'new' ||
      providers != null;
  String get filterKey =>
      '$type:$genre:$minimum:$maximum:$watchStatus:$providerQuery';

  Future<void> loadFilters({bool force = false}) async {
    final ticket = ++generation;
    loadingMore = false;
    moreError = null;
    nextBatch = 1;
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
        nextBatch = batchPositions[key] ?? 1;
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
        final viewer = ref.read(appControllerProvider);
        final catalog = ref.read(appControllerProvider.notifier).catalog;
        rows =
            [
                  ContentRow('For you', 'Your selected titles', catalog),
                  for (final g in catalog.expand((i) => i.genres).toSet())
                    ContentRow(
                      g,
                      null,
                      catalog.where((i) => i.genres.contains(g)).toList(),
                    ),
                ]
                .map(
                  (r) => ContentRow(
                    r.title,
                    r.subtitle,
                    r.items
                        .where(
                          (i) =>
                              (watchStatus == 'either' ||
                                  (watchStatus == 'again'
                                      ? viewer.watched.contains(i.key)
                                      : !viewer.watched.contains(i.key) &&
                                            !viewer.reactions.containsKey(
                                              i.key,
                                            ))) &&
                              viewer.reactions[i.key] != 'dislike' &&
                              i.availability.any(
                                (a) =>
                                    a.access == 'included' &&
                                    (providers ?? viewer.providers).contains(
                                      a.providerId,
                                    ),
                              ) &&
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
            'watchStatus': watchStatus,
            'providerIds': ?providerQuery,
            'batch': '0',
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
      if (snapshots.length >= 8) {
        batchPositions.remove(snapshots.keys.first);
        snapshots.remove(snapshots.keys.first);
      }
      snapshots[key] = rows;
      batchPositions[key] = 1;
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
    final value = await showModalBottomSheet<CatalogFilters>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => CatalogFilterSheet(
        type: type,
        genre: genre,
        min: minimum,
        max: maximum,
        watchStatus: watchStatus,
        providers: providers,
        services: {
          for (final id in ref.read(appControllerProvider).providers)
            id:
                ref
                    .read(appControllerProvider.notifier)
                    .availableServices[id] ??
                'Service $id',
        },
      ),
    );
    if (value == null || !mounted) return;
    setState(() {
      genre = value.genre;
      minimum = value.min;
      maximum = value.max;
      watchStatus = value.watchStatus;
      providers = value.providers;
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
          batchPositions.clear();
          providers = null;
          watchStatus = 'new';
          loadFilters();
        }
      },
    );
    final controller = ref.read(appControllerProvider.notifier);
    // Keep cached row order stable, but never retain a newly disliked title or
    // a title that no longer belongs to the selected viewing mode.
    final rows = hasFilters
        ? filteredRows
              .map(
                (r) => ContentRow(
                  r.title,
                  r.subtitle,
                  r.items
                      .where(
                        (i) =>
                            state.reactions[i.key] != 'dislike' &&
                            (watchStatus == 'either' ||
                                (watchStatus == 'again'
                                    ? state.watched.contains(i.key)
                                    : !state.watched.contains(i.key) &&
                                          !state.reactions.containsKey(i.key))),
                      )
                      .toList(),
                  id: r.id,
                ),
              )
              .where((r) => r.items.isNotEmpty)
              .toList()
        : controller.browseRows;
    final hero = hasFilters
        ? rows.firstOrNull?.items.firstOrNull
        : controller.browseHero;
    return Scaffold(
      appBar: const NexTopBar(),
      body: RefreshIndicator(
        onRefresh: () => _confirmRefresh(context, ref),
        child: NotificationListener<ScrollNotification>(
          onNotification: (event) {
            if (event.depth == 0 &&
                event.metrics.axis == Axis.vertical &&
                event.metrics.extentAfter < 600 &&
                (hasFilters
                    ? moreError == null
                    : controller.homeBatchError == null)) {
              loadMore();
            }
            return false;
          },
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
                      if (watchStatus != 'new')
                        InputChip(
                          label: Text(
                            watchStatus == 'again' ? 'Watch again' : 'Either',
                          ),
                          onDeleted: () {
                            setState(() => watchStatus = 'new');
                            loadFilters();
                          },
                        ),
                      if (providers != null)
                        InputChip(
                          label: Text('${providers!.length} services'),
                          onDeleted: () {
                            setState(() => providers = null);
                            loadFilters();
                          },
                        ),
                      if (minimum != null || maximum != null)
                        InputChip(
                          label: Text(
                            '${minimum ?? 1}–${maximum ?? 'any'} min',
                          ),
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
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      watchStatus == 'again'
                          ? 'No matching watched titles on these services. Try broader filters or add titles to your History.'
                          : 'No matching picks. Try broader filters or more streaming services.',
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
              SliverList.builder(
                itemCount: rows.length,
                itemBuilder: (_, index) => ContentShelf(row: rows[index]),
              ),
              if (hasFilters ? loadingMore : controller.homeBatchLoading)
                const SliverToBoxAdapter(child: HomeSkeleton(showHero: false))
              else if (!state.demoMode &&
                  !filtering &&
                  !state.busy &&
                  (hasFilters ? nextBatch < 6 : controller.hasMoreHome))
                SliverToBoxAdapter(
                  child: Column(
                    children: [
                      if ((hasFilters ? moreError : controller.homeBatchError)
                          case final String error)
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Text(error),
                        ),
                      TextButton(
                        onPressed: loadMore,
                        child: Text(
                          (hasFilters
                                      ? moreError
                                      : controller.homeBatchError) ==
                                  null
                              ? 'More to explore'
                              : 'Retry',
                        ),
                      ),
                    ],
                  ),
                ),
              const SliverToBoxAdapter(child: SizedBox(height: 20)),
            ],
          ),
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
      batchPositions.clear();
      if (hasFilters) {
        await loadFilters(force: true);
      } else {
        await ref.read(appControllerProvider.notifier).refreshLive();
      }
    }
  }

  Future<void> _showPickSheet(BuildContext context, WidgetRef ref) async {
    int? maxMinutes;
    final savedProviders = ref.read(appControllerProvider).providers;
    Set<int> pickProviders = Set.of(providers ?? savedProviders);
    String pickWatchStatus = watchStatus;
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
                providers: pickProviders.isEmpty ? null : pickProviders,
                watchStatus: pickWatchStatus,
              );
              if (context.mounted) setModalState(() => pick = next);
            } catch (_) {
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'No pick matched. Try widening your filters.',
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
                    const Text('Viewing'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final option in [
                          ('new', 'New to me'),
                          ('again', 'Watch again'),
                          ('either', 'Either'),
                        ])
                          ChoiceChip(
                            label: Text(option.$2),
                            selected: pickWatchStatus == option.$1,
                            onSelected: (_) => setModalState(
                              () => pickWatchStatus = option.$1,
                            ),
                          ),
                      ],
                    ),
                    if (savedProviders.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      const Text('Your streaming services'),
                      const SizedBox(height: 8),
                      StreamingServiceChips(
                        services: {
                          for (final id in savedProviders)
                            id:
                                controller.availableServices[id] ??
                                'Service $id',
                        },
                        selected: pickProviders,
                        onChanged: (next) =>
                            setModalState(() => pickProviders = next),
                      ),
                      if (pickProviders.isEmpty)
                        const Text('Select at least one streaming service.'),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed:
                          savedProviders.isNotEmpty && pickProviders.isEmpty
                          ? null
                          : choose,
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
                    TitleExtras(
                      key: ValueKey('pick-trailer-${pick!.key}'),
                      item: pick!,
                      trailerOnly: true,
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
