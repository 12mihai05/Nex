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
  @override
  void dispose() {
    debounce?.cancel();
    input.dispose();
    super.dispose();
  }

  void changed(String value) {
    debounce?.cancel();
    debounce = Timer(
      const Duration(milliseconds: 320),
      () => ref.read(appControllerProvider.notifier).search(value),
    );
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
                hintText: 'Title, person, mood or “under 90 minutes”',
              ),
            ),
          ),
          if (state.searchResults.isEmpty)
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
                        input.text.isEmpty
                            ? 'Search your whole entertainment universe.'
                            : 'No grounded results found.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Exact titles check every known provider. Discovery prioritizes services you own.',
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
