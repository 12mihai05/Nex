import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_client.dart';
import '../data/demo_data.dart';
import '../models/tv_program.dart';
import '../state/app_controller.dart';
import '../state/channel_favorites.dart';
import '../widgets/skeleton.dart';

class TvWindowScreen extends ConsumerStatefulWidget {
  const TvWindowScreen({
    super.key,
    required this.title,
    required this.bucket,
    required this.programBuilder,
  });
  final String title, bucket;
  final Widget Function(TvProgram) programBuilder;
  @override
  ConsumerState<TvWindowScreen> createState() => _TvWindowScreenState();
}

class _TvWindowScreenState extends ConsumerState<TvWindowScreen> {
  final items = <TvProgram>[];
  bool busy = false, more = false, favorites = false;
  String? error;
  int offset = 0, generation = 0;
  DateTime anchor = DateTime.now().toUtc();
  @override
  void initState() {
    super.initState();
    Future.microtask(() => load());
  }

  Future<void> load({bool next = false}) async {
    if (!mounted) return;
    if (DateTime.now().toUtc().difference(anchor) >
        const Duration(minutes: 50)) {
      next = false;
    }
    final ticket = ++generation;
    if (!next) {
      items.clear();
      offset = 0;
      anchor = DateTime.now().toUtc();
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final demo = ref.read(appControllerProvider).demoMode;
      final List<TvProgram> page;
      if (demo) {
        final bounds = {
          'soon': (0, 30),
          'next': (30, 60),
          'later': (60, 720),
        }[widget.bucket];
        final overrides = ref.read(channelOverridesProvider);
        page = demoTvPrograms().where((p) {
          final minutes = p.startsAt.difference(anchor).inSeconds / 60;
          final matches = widget.bucket == 'live'
              ? p.isLive
              : minutes > bounds!.$1 && minutes < bounds.$2;
          return matches &&
              (!favorites ||
                  (overrides[p.channelId.isEmpty ? p.channel : p.channelId] ??
                      p.favorite));
        }).toList();
      } else {
        final query = Uri(
          queryParameters: {
            'bucket': widget.bucket,
            'at': anchor.toIso8601String(),
            'favorites': '$favorites',
            'offset': '$offset',
          },
        ).query;
        page =
            (await ref.read(nexApiClientProvider).list('/api/tv/window?$query'))
                .map(TvProgram.fromJson)
                .toList();
      }
      if (!mounted || ticket != generation) return;
      setState(() {
        offset += page.length;
        final seen = items.map((p) => p.id).toSet();
        items.addAll(page.where((p) => seen.add(p.id)));
        more = !demo && page.length == 100;
      });
    } catch (e) {
      if (mounted && ticket == generation) {
        setState(() => error = readableApiError(e));
      }
    } finally {
      if (mounted && ticket == generation) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final overrides = ref.watch(channelOverridesProvider);
    bool favorite(TvProgram p) =>
        overrides[p.channelId.isEmpty ? p.channel : p.channelId] ?? p.favorite;
    final visible = items.where((p) => !favorites || favorite(p)).toList()
      ..sort((a, b) {
        final f = (favorite(b) ? 1 : 0) - (favorite(a) ? 1 : 0);
        if (f != 0) return f;
        final time = a.startsAt.compareTo(b.startsAt);
        if (time != 0) return time;
        final name = a.channel.compareTo(b.channel);
        return name != 0 ? name : a.id.compareTo(b.id);
      });
    ref.listen(appControllerProvider.select((s) => s.country), (old, next) {
      if (old != next) load();
    });
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FilterChip(
                label: const Text('Favorites only'),
                selected: favorites,
                onSelected: (v) {
                  setState(() => favorites = v);
                  load();
                },
              ),
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, box) => RefreshIndicator(
                onRefresh: () => load(),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(12),
                  children: [
                    ...visible.map(widget.programBuilder),
                    if (busy)
                      ChannelListSkeleton(
                        schedule: true,
                        height: box.maxHeight,
                      ),
                    if (error != null) ...[
                      Text(error!),
                      TextButton(
                        onPressed: () => load(next: offset > 0),
                        child: const Text('Retry'),
                      ),
                    ],
                    if (!busy && error == null && visible.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text('No listings in this time window.'),
                      ),
                    if (!busy && more)
                      TextButton(
                        onPressed: () => load(next: true),
                        child: const Text('Load more programmes'),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
