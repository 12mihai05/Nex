import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_client.dart';
import '../data/demo_data.dart';
import '../models/content.dart';
import '../state/app_controller.dart';
import 'artwork.dart';
import 'skeleton.dart';

class OnboardingFavorites extends ConsumerStatefulWidget {
  const OnboardingFavorites({super.key});
  @override
  ConsumerState<OnboardingFavorites> createState() =>
      _OnboardingFavoritesState();
}

class _OnboardingFavoritesState extends ConsumerState<OnboardingFavorites> {
  final input = TextEditingController();
  final cache = <String, List<ContentItem>>{};
  Timer? debounce;
  int generation = 0;
  bool busy = false;
  String? error;
  List<ContentItem> results = demoCatalog;
  @override
  void dispose() {
    debounce?.cancel();
    input.dispose();
    generation++;
    super.dispose();
  }

  void search(String value) {
    debounce?.cancel();
    final ticket = ++generation;
    final query = value.trim();
    ref.read(nexApiClientProvider).cancelSearch();
    setState(() {
      busy = query.isNotEmpty;
      error = null;
      if (query.isEmpty) results = demoCatalog;
    });
    if (query.isEmpty) return;
    debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final state = ref.read(appControllerProvider);
        final key = '${state.country}:${query.toLowerCase()}';
        final titles =
            cache[key] ??
            (state.demoMode
                ? demoCatalog
                      .where(
                        (i) =>
                            i.title.toLowerCase().contains(query.toLowerCase()),
                      )
                      .toList()
                : await ref.read(nexApiClientProvider).searchOnboarding(query));
        if (!mounted || ticket != generation) return;
        if (cache.length >= 20) cache.remove(cache.keys.first);
        cache[key] = titles;
        setState(() => results = titles);
      } catch (e) {
        if (mounted && ticket == generation) {
          setState(() => error = readableApiError(e));
        }
      } finally {
        if (mounted && ticket == generation) setState(() => busy = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final selected = ref.watch(
      appControllerProvider.select((s) => s.onboardingFavorites),
    );
    final controller = ref.read(appControllerProvider.notifier);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: input,
          onChanged: search,
          decoration: InputDecoration(
            hintText: 'Search movies and series',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: IconButton(
              tooltip: 'Clear search',
              icon: const Icon(Icons.close),
              onPressed: () {
                input.clear();
                search('');
              },
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text('${selected.length} of 5 selected'),
        if (selected.isNotEmpty)
          Wrap(
            spacing: 6,
            children: selected
                .map(
                  (i) => InputChip(
                    label: Text(i.title),
                    onDeleted: () => controller.toggleOnboardingFavorite(i),
                  ),
                )
                .toList(),
          ),
        const SizedBox(height: 12),
        SizedBox(
          height: 380,
          child: busy
              ? const PosterSkeletons()
              : error != null
              ? Column(
                  children: [
                    Text(error!),
                    TextButton(
                      onPressed: () => search(input.text),
                      child: const Text('Retry'),
                    ),
                  ],
                )
              : results.isEmpty
              ? const Center(
                  child: Text('No titles found. Try another spelling.'),
                )
              : GridView.builder(
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 145,
                    childAspectRatio: .53,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: results.length,
                  itemBuilder: (_, index) {
                    final item = results[index];
                    final checked = selected.any((i) => i.key == item.key);
                    return Semantics(
                      button: true,
                      selected: checked,
                      label: '${item.title}, ${item.mediaType.name}',
                      child: InkWell(
                        onTap: () {
                          if (!checked && selected.length >= 5) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Choose up to five. Remove one to add another.',
                                ),
                              ),
                            );
                          } else {
                            controller.toggleOnboardingFavorite(item);
                          }
                        },
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  Artwork(
                                    url: item.posterUrl,
                                    borderRadius: 14,
                                  ),
                                  if (checked)
                                    DecoratedBox(
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .primary,
                                          width: 3,
                                        ),
                                      ),
                                      child: const Align(
                                        alignment: Alignment.topRight,
                                        child: Padding(
                                          padding: EdgeInsets.all(5),
                                          child: CircleAvatar(
                                            radius: 13,
                                            child: Icon(Icons.check, size: 16),
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 5),
                            Text(
                              item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              '${item.year ?? ''} · ${item.mediaType == MediaType.movie ? 'Movie' : 'Series'}',
                              maxLines: 1,
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
