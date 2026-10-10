import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';
import '../models/content.dart';
import '../widgets/content_card.dart';
import '../widgets/skeleton.dart';
import '../data/api_client.dart';
import '../data/countries.dart';

class UpcomingMovies extends ConsumerStatefulWidget {
  const UpcomingMovies({super.key});
  @override
  ConsumerState<UpcomingMovies> createState() => _UpcomingMoviesState();
}

class _UpcomingMoviesState extends ConsumerState<UpcomingMovies>
    with WidgetsBindingObserver {
  final items = <ContentItem>[];
  bool loading = false, more = true;
  int page = 1, generation = 0;
  String? error;
  String day = '';
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) load(reset: true);
  }

  Future<void> load({bool reset = false}) async {
    if (!reset && (loading || !more)) return;
    if (reset) {
      generation++;
      page = 1;
      items.clear();
      more = true;
    }
    final ticket = generation;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = ref.read(appControllerProvider).demoMode
          ? <String, dynamic>{
              'data': [],
              'meta': {'hasMore': false},
            }
          : await ref.read(nexApiClientProvider).upcoming(page);
      if (!mounted || ticket != generation) return;
      final meta = (result['meta'] as Map?) ?? {};
      final nextDay = meta['day'] as String? ?? '';
      if (day.isNotEmpty && day != nextDay && page > 1) {
        load(reset: true);
        return;
      }
      day = nextDay;
      setState(() {
        final keys = items.map((i) => i.key).toSet();
        items.addAll(
          (result['data'] as List)
              .map(
                (v) => ContentItem.fromJson((v as Map).cast<String, dynamic>()),
              )
              .where((i) => keys.add(i.key)),
        );
        more = meta['hasMore'] == true;
        page++;
      });
    } catch (e) {
      if (mounted && ticket == generation) {
        setState(() => error = readableApiError(e));
      }
    } finally {
      if (mounted && ticket == generation) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final country = ref.watch(appControllerProvider.select((s) => s.country));
    return RefreshIndicator(
      onRefresh: () => load(reset: true),
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 600 && !loading && error == null) load();
          return false;
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Upcoming in cinemas',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${watchingCountries[country] ?? country} · Announced cinema dates, subject to change. Not streaming availability.',
                    ),
                  ],
                ),
              ),
            ),
            if (items.isEmpty && loading)
              const SliverFillRemaining(
                child: PosterSkeletons(maxCardWidth: 190, aspectRatio: .51),
              ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverGrid.builder(
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 190,
                  childAspectRatio: .51,
                  crossAxisSpacing: 14,
                  mainAxisSpacing: 18,
                ),
                itemCount: items.length,
                itemBuilder: (_, i) => ContentCard(item: items[i]),
              ),
            ),
            if (items.isEmpty && !loading && error == null)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'No upcoming cinema dates listed for this country. You can still search for an unreleased title.',
                    ),
                  ),
                ),
              ),
            if (items.isNotEmpty && loading)
              const SliverToBoxAdapter(
                child: SizedBox(
                  height: 360,
                  child: PosterSkeletons(maxCardWidth: 190, aspectRatio: .51),
                ),
              ),
            if (error != null)
              SliverToBoxAdapter(
                child: Column(
                  children: [
                    Text(error!),
                    TextButton(onPressed: load, child: const Text('Retry')),
                  ],
                ),
              ),
            if (more && !loading && error == null)
              SliverToBoxAdapter(
                child: TextButton(
                  onPressed: load,
                  child: const Text('Show more'),
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
    );
  }
}
