import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_client.dart';
import '../data/taste_options.dart';
import '../models/content.dart';
import '../state/app_controller.dart';
import '../widgets/content_card.dart';
import '../widgets/content_row.dart';
import '../widgets/skeleton.dart';

const seriesGenres = [
  'Action & Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Kids',
  'Mystery',
  'News',
  'Reality',
  'Sci-Fi & Fantasy',
  'Soap',
  'Talk',
  'War & Politics',
  'Western',
];

class FilteredCatalogScreen extends ConsumerStatefulWidget {
  const FilteredCatalogScreen({super.key, this.initialType = 'any'});
  final String initialType;
  @override
  ConsumerState<FilteredCatalogScreen> createState() => _FilteredCatalogState();
}

class _FilteredCatalogState extends ConsumerState<FilteredCatalogScreen> {
  late String type = widget.initialType;
  String? genre, error;
  int? minMinutes, maxMinutes;
  int page = 0, generation = 0;
  bool busy = false, more = false;
  List<ContentItem> items = [];
  @override
  void initState() {
    super.initState();
    Future.microtask(load);
  }

  Future<void> load({bool next = false}) async {
    if (!mounted) return;
    final ticket = ++generation;
    final requestedPage = next ? page + 1 : 1;
    final country = ref.read(appControllerProvider).country;
    setState(() {
      busy = true;
      error = null;
      if (!next) {
        items = [];
        page = 0;
        more = false;
      }
    });
    try {
      final state = ref.read(appControllerProvider);
      List<ContentItem> result;
      bool hasMore = false;
      if (state.demoMode) {
        result = ref
            .read(appControllerProvider.notifier)
            .catalog
            .where(
              (i) =>
                  (type == 'any' || i.mediaType.name == type) &&
                  (genre == null || i.genres.contains(genre)) &&
                  (minMinutes == null ||
                      (i.runtimeMinutes != null &&
                          i.runtimeMinutes! >= minMinutes!)) &&
                  (maxMinutes == null ||
                      (i.runtimeMinutes != null &&
                          i.runtimeMinutes! <= maxMinutes!)),
            )
            .toList();
      } else {
        final data = await ref.read(nexApiClientProvider).filteredCatalog({
          'mediaType': type,
          'genre': ?genre,
          'minMinutes': ?minMinutes,
          'maxMinutes': ?maxMinutes,
          'page': requestedPage,
        });
        result = (data['data'] as List)
            .map(
              (v) => ContentItem.fromJson((v as Map).cast<String, dynamic>()),
            )
            .toList();
        hasMore = (data['meta'] as Map)['hasMore'] == true;
      }
      if (!mounted ||
          ticket != generation ||
          country != ref.read(appControllerProvider).country) {
        return;
      }
      setState(() {
        items = {
          for (final item in [...items, ...result]) item.key: item,
        }.values.toList();
        page = requestedPage;
        more = hasMore;
      });
    } catch (e) {
      if (mounted && ticket == generation) {
        setState(() => error = readableApiError(e));
      }
    } finally {
      if (mounted && ticket == generation) setState(() => busy = false);
    }
  }

  Future<void> editFilters() async {
    final result =
        await showModalBottomSheet<({String? genre, int? min, int? max})>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          useSafeArea: true,
          builder: (_) => CatalogFilterSheet(
            type: type,
            genre: genre,
            min: minMinutes,
            max: maxMinutes,
          ),
        );
    if (result == null || !mounted) return;
    setState(() {
      genre = result.genre;
      minMinutes = result.min;
      maxMinutes = result.max;
    });
    await load();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(
      appControllerProvider.select(
        (s) => (s.country, (s.providers.toList()..sort()).join(',')),
      ),
      (previous, next) {
        if (previous != next) load();
      },
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Explore streaming')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
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
                        minMinutes = null;
                        maxMinutes = null;
                      });
                      load();
                    },
                  ),
                ActionChip(
                  avatar: const Icon(Icons.tune, size: 18),
                  label: const Text('Filters'),
                  onPressed: editFilters,
                ),
              ],
            ),
          ),
          if (genre != null || minMinutes != null || maxMinutes != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Wrap(
                spacing: 8,
                children: [
                  if (genre != null)
                    InputChip(
                      label: Text(genre!),
                      onDeleted: () {
                        setState(() => genre = null);
                        load();
                      },
                    ),
                  if (minMinutes != null || maxMinutes != null)
                    InputChip(
                      label: Text(
                        '${minMinutes ?? 1}–${maxMinutes ?? 'any'} min',
                      ),
                      onDeleted: () {
                        setState(() {
                          minMinutes = null;
                          maxMinutes = null;
                        });
                        load();
                      },
                    ),
                ],
              ),
            ),
          Expanded(
            child: busy && items.isEmpty
                ? const PosterSkeletons()
                : CustomScrollView(
                    slivers: [
                      if (error != null)
                        SliverToBoxAdapter(
                          child: Column(
                            children: [
                              Text(error!),
                              TextButton(
                                onPressed: () => load(next: page > 0),
                                child: const Text('Retry'),
                              ),
                            ],
                          ),
                        ),
                      if (!busy && error == null && items.isEmpty)
                        const SliverToBoxAdapter(
                          child: Padding(
                            padding: EdgeInsets.all(32),
                            child: Text(
                              'No matching titles on this page. Try broader filters or check the next page.',
                            ),
                          ),
                        ),
                      SliverPadding(
                        padding: const EdgeInsets.all(16),
                        sliver: SliverGrid.builder(
                          gridDelegate:
                              const SliverGridDelegateWithMaxCrossAxisExtent(
                                maxCrossAxisExtent: 180,
                                childAspectRatio: .49,
                                crossAxisSpacing: 14,
                                mainAxisSpacing: 18,
                              ),
                          itemCount: items.length,
                          itemBuilder: (_, i) => ContentCard(
                            item: items[i],
                            width: 160,
                            onLongPress: () =>
                                showQuickActions(context, ref, items[i]),
                          ),
                        ),
                      ),
                      if (busy)
                        const SliverToBoxAdapter(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: NexSkeleton(
                              child: SkeletonBlock(height: 100),
                            ),
                          ),
                        ),
                      if (more && !busy)
                        SliverToBoxAdapter(
                          child: TextButton(
                            onPressed: () => load(next: true),
                            child: const Text('Load more'),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class CatalogFilterSheet extends StatefulWidget {
  const CatalogFilterSheet({
    super.key,
    required this.type,
    this.genre,
    this.min,
    this.max,
  });
  final String type;
  final String? genre;
  final int? min, max;
  @override
  State<CatalogFilterSheet> createState() => _CatalogFilterSheetState();
}

class _CatalogFilterSheetState extends State<CatalogFilterSheet> {
  late String? genre = widget.genre;
  late final minimum = TextEditingController(
    text: widget.min?.toString() ?? '',
  );
  late final maximum = TextEditingController(
    text: widget.max?.toString() ?? '',
  );
  String? error;
  @override
  void dispose() {
    minimum.dispose();
    maximum.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final genres =
        widget.type == 'series'
              ? [...seriesGenres]
              : widget.type == 'movie'
              ? [...onboardingGenres, 'TV Movie']
              : {...onboardingGenres, ...seriesGenres, 'TV Movie'}.toList()
          ..sort();
    return SingleChildScrollView(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          0,
          24,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filters', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 20),
            DropdownButtonFormField<String>(
              initialValue: genre ?? '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Genre'),
              items: [
                const DropdownMenuItem(value: '', child: Text('All genres')),
                ...genres.map(
                  (g) => DropdownMenuItem(value: g, child: Text(g)),
                ),
              ],
              onChanged: (value) =>
                  setState(() => genre = value == '' ? null : value),
            ),
            const SizedBox(height: 24),
            if (widget.type == 'movie') ...[
              const Text('Movie duration · minutes'),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: minimum,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Minimum',
                        hintText: 'No minimum',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: maximum,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Maximum',
                        hintText: 'No maximum',
                      ),
                    ),
                  ),
                ],
              ),
            ] else
              const Text(
                'Select Movies to filter by duration. Series lengths vary by episode.',
              ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                final min = int.tryParse(minimum.text),
                    max = int.tryParse(maximum.text);
                if ((min != null && (min < 1 || min > 1440)) ||
                    (max != null && (max < 1 || max > 1440)) ||
                    (min != null && max != null && min > max)) {
                  setState(
                    () => error = 'Use 1–1440 minutes, with minimum no greater than maximum.',
                  );
                  return;
                }
                Navigator.pop(context, (genre: genre, min: min, max: max));
              },
              child: const Text('Show titles'),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.pop(context, (genre: null, min: null, max: null)),
              child: const Text('Clear filters'),
            ),
          ],
        ),
      ),
    );
  }
}
