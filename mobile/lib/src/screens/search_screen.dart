import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';
import '../widgets/content_card.dart';
import '../widgets/content_row.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final input = TextEditingController();
  Timer? debounce;
  bool searching = false;
  String? searchError;
  int generation = 0;
  @override
  void dispose() {
    debounce?.cancel();
    input.dispose();
    super.dispose();
  }

  void changed(String value) {
    debounce?.cancel();
    final ticket = ++generation;
    // Clear/invalidate older controller requests immediately, not after debounce.
    ref.read(appControllerProvider.notifier).search('');
    setState(() {
      searching = value.trim().isNotEmpty;
      searchError = null;
    });
    debounce = Timer(const Duration(milliseconds: 320), () async {
      await ref.read(appControllerProvider.notifier).search(value);
      if (mounted && ticket == generation) {
        setState(() {
          searching = false;
          searchError = ref.read(appControllerProvider).error;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: TextField(
              controller: input,
              autofocus: true,
              onChanged: changed,
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Search movies and series by title',
              ),
            ),
          ),
          if (searching)
            Expanded(
              child: Semantics(
                liveRegion: true,
                label: 'Searching titles',
                child: Column(
                  children: [
                    const Padding(
                      padding: EdgeInsets.all(20),
                      child: Text('Looking through the catalog…'),
                    ),
                    Expanded(
                      child: GridView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: 6,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              childAspectRatio: .65,
                              crossAxisSpacing: 16,
                              mainAxisSpacing: 16,
                            ),
                        itemBuilder: (_, index) =>
                            TweenAnimationBuilder<double>(
                              tween: Tween(begin: .3, end: 1),
                              duration: Duration(
                                milliseconds: 400 + index * 120,
                              ),
                              builder: (context, value, child) =>
                                  Opacity(opacity: value, child: child),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(18),
                                ),
                              ),
                            ),
                      ),
                    ),
                  ],
                ),
              ),
            )
          else if (state.searchResults.isEmpty || searchError != null)
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.manage_search, size: 42),
                      const SizedBox(height: 14),
                      Text(
                        searchError ??
                            (input.text.isEmpty
                                ? 'Search your whole entertainment universe.'
                                : 'No titles found. Try another spelling.'),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Search checks all providers in your country. For moods, story ideas or time limits, ask Nex in Chat.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 180,
                  childAspectRatio: .49,
                  crossAxisSpacing: 14,
                  mainAxisSpacing: 18,
                ),
                itemCount: state.searchResults.length,
                itemBuilder: (_, index) => ContentCard(
                  item: state.searchResults[index],
                  width: 160,
                  onLongPress: () => showQuickActions(
                    context,
                    ref,
                    state.searchResults[index],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
