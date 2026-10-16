import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';
import '../models/content.dart';
import '../widgets/content_card.dart';
import '../widgets/content_row.dart';
import '../widgets/catalog_filter_sheet.dart';
import '../widgets/skeleton.dart';

bool libraryMatches(
  ContentItem item, {
  String type = 'any',
  String query = '',
  String? genre,
  int? minimum,
  int? maximum,
  Set<int>? providers,
}) {
  if (type != 'any' && item.mediaType.name != type) return false;
  final text = query.trim().toLowerCase();
  if (text.isNotEmpty &&
      !item.title.toLowerCase().contains(text) &&
      !(item.originalTitle?.toLowerCase().contains(text) ?? false)) {
    return false;
  }
  if (genre != null &&
      !item.genres.any((g) => g.toLowerCase() == genre.toLowerCase())) {
    return false;
  }
  if (minimum != null || maximum != null) {
    if (item.mediaType != MediaType.movie || item.runtimeMinutes == null) {
      return false;
    }
    if (minimum != null && item.runtimeMinutes! < minimum) return false;
    if (maximum != null && item.runtimeMinutes! > maximum) return false;
  }
  if (providers != null &&
      !item.availability.any(
        (a) => providers.contains(a.providerId) && a.access == 'included',
      )) {
    return false;
  }
  return true;
}

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key, required this.watched});
  final bool watched;
  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  final search = TextEditingController();
  @override
  void dispose() {
    generation++;
    search.dispose();
    super.dispose();
  }

  String type = 'any', query = '';
  String? genre, country;
  int? minimum, maximum;
  Set<int>? providers;
  final details = <String, ContentItem>{};
  final checked = <String>{}, failed = <String>{};
  bool loading = false;
  int generation = 0;
  bool get metadataFilter =>
      genre != null || minimum != null || maximum != null || providers != null;
  bool get hasFilters => type != 'any' || metadataFilter || query.isNotEmpty;
  List<ContentItem> get saved {
    final state = ref.read(appControllerProvider);
    final keys = widget.watched ? state.watched : state.watchlist;
    return ref
        .read(appControllerProvider.notifier)
        .catalog
        .where((i) => keys.contains(i.key))
        .toList();
  }

  List<ContentItem> get pending => saved
      .where(
        (i) =>
            !checked.contains(i.key) &&
            (metadataFilter || i.posterUrl == null || i.posterUrl!.isEmpty) &&
            (type == 'any' || i.mediaType.name == type),
      )
      .toList();
  Future<void> loadDetails() async {
    if (loading || ref.read(appControllerProvider).demoMode) {
      return;
    }
    final batch = pending.take(12).toList();
    if (batch.isEmpty) return;
    final ticket = generation;
    setState(() => loading = true);
    final api = ref.read(nexApiClientProvider);
    for (var offset = 0; offset < batch.length; offset += 4) {
      await Future.wait(
        batch.skip(offset).take(4).map((item) async {
          try {
            final full = await api.title(item.mediaType.name, item.id);
            if (!mounted || ticket != generation) return;
            details[item.key] = full;
            ref
                .read(appControllerProvider.notifier)
                .rememberLibraryDetails(full);
            failed.remove(item.key);
          } catch (_) {
            if (!mounted || ticket != generation) return;
            failed.add(item.key);
          }
          if (mounted && ticket == generation) checked.add(item.key);
        }),
      );
      if (!mounted || ticket != generation) return;
      setState(() {});
    }
    if (mounted && ticket == generation) setState(() => loading = false);
  }

  Future<void> editFilters() async {
    final state = ref.read(appControllerProvider);
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
        providers: providers,
        libraryMode: true,
        services: {
          for (final id in state.providers)
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
      providers = value.providers;
      if (minimum != null || maximum != null) type = 'movie';
    });
    await loadDetails();
  }

  void clear() => setState(() {
    query = '';
    search.clear();
    type = 'any';
    genre = null;
    minimum = null;
    maximum = null;
    providers = null;
  });
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    if (country != state.country) {
      country = state.country;
      generation++;
      details.clear();
      checked.clear();
      failed.clear();
      loading = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) loadDetails();
      });
    }
    final source = saved;
    final matches = source
        .where(
          (i) =>
              !metadataFilter || state.demoMode || details.containsKey(i.key),
        )
        .map((i) => details[i.key] ?? i)
        .where(
          (i) => libraryMatches(
            i,
            type: type,
            query: query,
            genre: genre,
            minimum: minimum,
            maximum: maximum,
            providers: providers,
          ),
        )
        .toList();
    final remaining = !state.demoMode ? pending.length : 0;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.watched ? 'Seen library' : 'Want to see'),
      ),
      body: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.depth == 0 &&
              n.metrics.extentAfter < 400 &&
              remaining > 0 &&
              !loading) {
            loadDetails();
          }
          return false;
        },
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  children: [
                    TextField(
                      controller: search,
                      onChanged: (value) => setState(() => query = value),
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.search),
                        hintText: 'Search your library',
                      ),
                    ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          for (final option in [
                            ('any', 'All'),
                            ('movie', 'Movies'),
                            ('series', 'Series'),
                          ])
                            ChoiceChip(
                              label: Text(option.$2),
                              selected: type == option.$1,
                              onSelected: (_) {
                                setState(() {
                                  type = option.$1;
                                  genre = null;
                                  minimum = null;
                                  maximum = null;
                                });
                                loadDetails();
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
                              onDeleted: () => setState(() => genre = null),
                            ),
                          if (minimum != null || maximum != null)
                            InputChip(
                              label: Text(
                                '${minimum ?? 0}–${maximum ?? 'Any'} min',
                              ),
                              onDeleted: () => setState(() {
                                minimum = null;
                                maximum = null;
                              }),
                            ),
                          if (providers != null)
                            InputChip(
                              label: const Text('Selected services'),
                              onDeleted: () => setState(() => providers = null),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (matches.isEmpty && !loading && remaining == 0)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    children: [
                      Icon(
                        widget.watched ? Icons.history : Icons.bookmark_outline,
                        size: 42,
                      ),
                      const SizedBox(height: 14),
                      Text(
                        source.isEmpty
                            ? (widget.watched
                                  ? 'Nothing marked watched yet.'
                                  : 'Save movies and series you want to see.')
                            : 'No matching titles in your library.',
                        textAlign: TextAlign.center,
                      ),
                      if (hasFilters && source.isNotEmpty)
                        TextButton(
                          onPressed: clear,
                          child: const Text('Clear filters'),
                        ),
                    ],
                  ),
                ),
              ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverGrid.builder(
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 180,
                  childAspectRatio: .49,
                  crossAxisSpacing: 14,
                  mainAxisSpacing: 18,
                ),
                itemCount: matches.length,
                itemBuilder: (_, index) => ContentCard(
                  item: matches[index],
                  width: 160,
                  onLongPress: () =>
                      showQuickActions(context, ref, matches[index]),
                ),
              ),
            ),
            if (loading)
              const SliverToBoxAdapter(
                child: SizedBox(height: 380, child: PosterSkeletons()),
              ),
            if (remaining > 0)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(
                        '$remaining more saved titles to check for these filters.',
                      ),
                      TextButton(
                        onPressed: loading ? null : loadDetails,
                        child: const Text('Check more saved titles'),
                      ),
                    ],
                  ),
                ),
              ),
            if (metadataFilter && failed.isNotEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(
                        'Details for ${failed.length} saved titles could not load. They have not been removed.',
                      ),
                      TextButton(
                        onPressed: loading
                            ? null
                            : () {
                                checked.removeAll(failed);
                                failed.clear();
                                loadDetails();
                              },
                        child: const Text('Retry missing details'),
                      ),
                    ],
                  ),
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
    );
  }
}
