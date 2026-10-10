import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/api_client.dart';
import '../data/demo_data.dart';
import '../models/tv_program.dart';
import '../state/app_controller.dart';
import '../state/channel_favorites.dart';
import '../widgets/programme_sheet.dart';
import '../widgets/nex_notice.dart';
import '../widgets/skeleton.dart';

class TvGuideScreen extends ConsumerStatefulWidget {
  const TvGuideScreen({super.key, this.active = true});
  final bool active;
  @override
  ConsumerState<TvGuideScreen> createState() => _TvGuideScreenState();
}

class _TvGuideScreenState extends ConsumerState<TvGuideScreen> {
  static const channelWidth = 112.0,
      pixelsPerMinute = 3.0,
      timelineWidth = 1080.0;
  double get rowHeight =>
      100 * (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1, 2);
  final search = TextEditingController(),
      vertical = ScrollController(),
      horizontal = ScrollController();
  final offset = ValueNotifier<double>(0);
  final cache = <String, ({DateTime at, Map<String, dynamic> data})>{};
  final saving = <String>{};
  // Freeze ordering until the next deliberate reload, not the displayed stars.
  final orderOverrides = <String, bool>{};
  List<Map<String, dynamic>> channels = [];
  DateTime start = _currentStart();
  String query = '', scope = '';
  String visibleKey = '';
  String? error;
  bool loading = false, hasMore = false, favorites = false;
  int generation = 0;
  Timer? debounce, clock;
  static DateTime _currentStart() {
    final now = DateTime.now();
    return DateTime(
      now.year,
      now.month,
      now.day,
      now.hour,
      now.minute < 30 ? 0 : 30,
    );
  }

  @override
  void initState() {
    super.initState();
    horizontal.addListener(() => offset.value = horizontal.offset);
    vertical.addListener(() {
      if (vertical.position.extentAfter < 500 && !loading && hasMore) {
        load(next: true);
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.active) load();
    });
    clock = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted && widget.active) setState(() {});
    });
  }

  @override
  void didUpdateWidget(TvGuideScreen old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) load();
  }

  @override
  void dispose() {
    generation++;
    debounce?.cancel();
    clock?.cancel();
    search.dispose();
    vertical.dispose();
    horizontal.dispose();
    offset.dispose();
    super.dispose();
  }

  Future<void> load({bool next = false, bool force = false}) async {
    if (next && loading) return;
    final ticket = ++generation, state = ref.read(appControllerProvider);
    final nextScope =
        '${state.country}:${state.authenticated}:${state.demoMode}';
    if (scope != nextScope) {
      scope = nextScope;
      cache.clear();
      channels = [];
      next = false;
      query = '';
      search.clear();
    }
    final page = next ? channels.length : 0;
    if (!next) orderOverrides.clear();
    final viewKey =
        '$scope:${start.toUtc().toIso8601String()}:$query:$favorites';
    setState(() {
      loading = true;
      error = null;
      if (!next && visibleKey != viewKey) channels = [];
      visibleKey = viewKey;
    });
    final key =
        '$scope:${start.toUtc().toIso8601String()}:$query:$favorites:$page';
    try {
      Map<String, dynamic> data;
      final hit = cache[key];
      if (!force &&
          hit != null &&
          DateTime.now().difference(hit.at) < const Duration(minutes: 2)) {
        data = hit.data;
      } else if (state.demoMode) {
        final programs = demoTvPrograms();
        data = {
          'hasMore': false,
          'channels': [
            for (final name
                in programs
                    .map((p) => p.channel)
                    .toSet()
                    .where(
                      (n) => n.toLowerCase().contains(query.toLowerCase()),
                    ))
              {
                'id': name,
                'name': name,
                'favorite': ref.read(channelOverridesProvider)[name] ?? false,
                'demoPrograms': programs
                    .where((p) => p.channel == name)
                    .toList(),
              },
          ],
        };
      } else {
        data = await ref
            .read(nexApiClientProvider)
            .object(
              Uri(
                path: '/api/tv/guide',
                queryParameters: {
                  'start': start.toUtc().toIso8601String(),
                  'q': query,
                  'favorites': '$favorites',
                  'offset': '$page',
                  if (orderOverrides.isNotEmpty)
                    'orderOverrides': jsonEncode(orderOverrides),
                },
              ).toString(),
            );
      }
      if (!mounted || ticket != generation) return;
      if (cache.length >= 40) cache.remove(cache.keys.first);
      cache[key] = (at: DateTime.now(), data: data);
      final incoming = (data['channels'] as List)
          .map((c) => (c as Map).cast<String, dynamic>())
          .where((c) => !state.demoMode || !favorites || c['favorite'] == true)
          .toList();
      if (state.demoMode) {
        incoming.sort(
          (a, b) => (b['favorite'] == true ? 1 : 0).compareTo(
            a['favorite'] == true ? 1 : 0,
          ),
        );
      }
      setState(() {
        channels = next ? [...channels, ...incoming] : incoming;
        hasMore = data['hasMore'] == true;
      });
    } catch (e) {
      if (mounted && ticket == generation) {
        setState(() => error = readableApiError(e));
      }
    } finally {
      if (mounted && ticket == generation) setState(() => loading = false);
    }
  }

  Future<void> favorite(Map<String, dynamic> channel) async {
    final id = channel['id'] as String;
    if (saving.contains(id)) return;
    final overrides = ref.read(channelOverridesProvider.notifier),
        before =
            ref.read(channelOverridesProvider)[id] ??
            channel['favorite'] == true;
    final savedScope = scope;
    orderOverrides.putIfAbsent(id, () => channel['favorite'] == true);
    overrides.set(id, !before);
    setState(() => saving.add(id));
    try {
      if (!ref.read(appControllerProvider).demoMode) {
        await ref.read(nexApiClientProvider).setChannelFavorite(id, !before);
      }
      if (mounted && savedScope == scope) {
        cache.clear();
      }
    } catch (_) {
      if (mounted && savedScope == scope) {
        overrides.set(id, before);
        showNexNotice(
          context,
          'Could not update this favourite. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => saving.remove(id));
    }
  }

  Future<void> openProgram(TvProgram p) async {
    final saved = ref
        .read(appControllerProvider)
        .reminderProgramIds
        .contains(p.id);
    final minutes = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => ProgrammeSheet(program: p, saved: saved),
    );
    if (minutes == null || !mounted) return;
    try {
      final controller = ref.read(appControllerProvider.notifier);
      if (minutes < 0) {
        await controller.cancelReminder(p.id);
      } else {
        await controller.setReminder(p, minutes);
      }
      if (mounted) {
        showNexNotice(
          context,
          minutes < 0
              ? 'Reminder cancelled.'
              : 'Reminder scheduled on ${p.channel}.',
        );
      }
    } catch (_) {
      if (mounted) {
        showNexNotice(
          context,
          'Could not update the reminder. Check its time and notification permissions.',
        );
      }
    }
  }

  void shift(int hours) {
    setState(() => start = start.add(Duration(hours: hours)));
    if (horizontal.hasClients) horizontal.jumpTo(0);
    load();
  }

  Widget timeline(Map<String, dynamic> c, double x, double width) {
    final programs =
        (c['demoPrograms'] as List<TvProgram>?) ??
        (c['programs'] as List? ?? [])
            .map((p) => TvProgram.fromJson((p as Map).cast<String, dynamic>()))
            .toList();
    final scheme = Theme.of(context).colorScheme;
    final now =
        DateTime.now().difference(start).inSeconds / 60 * pixelsPerMinute - x;
    return ClipRect(
      child: Stack(
        children: [
          for (var i = 0; i <= 12; i++)
            if (i * 90 - x >= 0 && i * 90 - x < width)
              Positioned(
                left: i * 90 - x,
                top: 0,
                bottom: 0,
                child: Container(
                  width: 1,
                  color: scheme.outlineVariant.withValues(alpha: .4),
                ),
              ),
          if (programs.isEmpty)
            const Positioned(
              left: 12,
              top: 32,
              child: Text('No listing available'),
            ),
          for (final p in programs)
            if (p.endsAt.difference(start).inSeconds / 60 * pixelsPerMinute >
                    x &&
                p.startsAt.difference(start).inSeconds / 60 * pixelsPerMinute <
                    x + width)
              Positioned(
                left:
                    math.max(
                      0,
                      p.startsAt.difference(start).inSeconds /
                              60 *
                              pixelsPerMinute -
                          x,
                    ) +
                    2,
                top: 5,
                bottom: 5,
                width: math.max(
                  1,
                  math.min(
                        width,
                        p.endsAt.difference(start).inSeconds /
                                60 *
                                pixelsPerMinute -
                            x,
                      ) -
                      math.max(
                        0,
                        p.startsAt.difference(start).inSeconds /
                                60 *
                                pixelsPerMinute -
                            x,
                      ) -
                      4,
                ),
                child: Material(
                  color: p.isLive
                      ? scheme.primaryContainer
                      : scheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(12),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => openProgram(p),
                    child: Padding(
                      padding: const EdgeInsets.all(9),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            p.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: p.isLive
                                  ? scheme.onPrimaryContainer
                                  : scheme.onSurface,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '${DateFormat.Hm().format(p.startsAt)} – ${DateFormat.Hm().format(p.endsAt)}',
                            maxLines: 1,
                            overflow: TextOverflow.clip,
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(
                                  color: p.isLive
                                      ? scheme.onPrimaryContainer
                                      : scheme.onSurface,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          if (now >= 0 && now < width)
            Positioned(
              left: now,
              top: 0,
              bottom: 0,
              child: IgnorePointer(
                child: Container(width: 2, color: scheme.primary),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider),
        overrides = ref.watch(channelOverridesProvider);
    final currentScope =
        '${state.country}:${state.authenticated}:${state.demoMode}';
    if (scope.isNotEmpty && scope != currentScope) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && scope != currentScope) load();
      });
    }
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'TV guide',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Refresh guide',
                    onPressed: loading ? null : () => load(force: true),
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: search,
                decoration: InputDecoration(
                  hintText: 'Find a channel',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: search.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            search.clear();
                            query = '';
                            load();
                          },
                        ),
                ),
                onChanged: (v) {
                  debounce?.cancel();
                  setState(() {});
                  debounce = Timer(const Duration(milliseconds: 300), () {
                    query = v.trim();
                    load();
                  });
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  FilterChip(
                    label: const Text('Favourites'),
                    selected: favorites,
                    onSelected: (v) {
                      setState(() => favorites = v);
                      load();
                    },
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () {
                      setState(() => start = _currentStart());
                      if (horizontal.hasClients) horizontal.jumpTo(0);
                      load();
                    },
                    child: const Text('Now'),
                  ),
                  IconButton(
                    tooltip: 'Previous 6 hours',
                    onPressed:
                        start.isAfter(
                          DateTime.now().subtract(const Duration(hours: 17)),
                        )
                        ? () => shift(-6)
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  IconButton(
                    tooltip: 'Next 6 hours',
                    onPressed:
                        start.isBefore(
                          DateTime.now().add(const Duration(days: 13)),
                        )
                        ? () => shift(6)
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(left: 16, bottom: 8),
                child: Text(
                  '${DateFormat.MMMEd().format(start)} · device time',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ),
            ),
            if (error != null)
              TextButton(
                onPressed: () => load(force: true),
                child: Text(error!),
              ),
            SizedBox(
              height: 36,
              child: Row(
                children: [
                  const SizedBox(width: channelWidth),
                  Expanded(
                    child: SingleChildScrollView(
                      controller: horizontal,
                      scrollDirection: Axis.horizontal,
                      child: SizedBox(
                        width: timelineWidth,
                        child: Row(
                          children: [
                            for (var i = 0; i < 12; i++)
                              SizedBox(
                                width: 90,
                                child: Text(
                                  DateFormat.Hm().format(
                                    start.add(Duration(minutes: i * 30)),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) => GestureDetector(
                  onHorizontalDragEnd: (d) {
                    if (horizontal.hasClients) {
                      horizontal.animateTo(
                        (horizontal.offset - (d.primaryVelocity ?? 0) * .15)
                            .clamp(0, horizontal.position.maxScrollExtent),
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.decelerate,
                      );
                    }
                  },
                  onHorizontalDragUpdate: (d) {
                    if (horizontal.hasClients) {
                      horizontal.jumpTo(
                        (horizontal.offset - d.delta.dx).clamp(
                          0,
                          horizontal.position.maxScrollExtent,
                        ),
                      );
                    }
                  },
                  child: ListView.builder(
                    controller: vertical,
                    itemExtent: rowHeight,
                    itemCount:
                        channels.length +
                        (loading
                            ? (constraints.maxHeight / rowHeight).ceil()
                            : hasMore
                            ? 1
                            : 0),
                    itemBuilder: (context, index) {
                      if (index >= channels.length) {
                        if (!loading) {
                          return TextButton(
                            onPressed: () => load(next: true),
                            child: const Text('More channels'),
                          );
                        }
                        return const NexSkeleton(
                          child: Row(
                            children: [
                              SizedBox(
                                width: channelWidth,
                                child: Padding(
                                  padding: EdgeInsets.all(12),
                                  child: SkeletonBlock(height: 70, radius: 12),
                                ),
                              ),
                              Expanded(
                                child: Padding(
                                  padding: EdgeInsets.all(5),
                                  child: SkeletonBlock(height: 90, radius: 12),
                                ),
                              ),
                            ],
                          ),
                        );
                      }
                      final c = channels[index],
                          id = c['id'] as String,
                          isFavorite = overrides[id] ?? c['favorite'] == true;
                      return Row(
                        key: ValueKey(id),
                        children: [
                          SizedBox(
                            width: channelWidth,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    c['name'] as String,
                                    maxLines: 2,
                                    textAlign: TextAlign.center,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelLarge,
                                  ),
                                  IconButton(
                                    tooltip: isFavorite
                                        ? 'Remove favourite'
                                        : 'Favourite channel',
                                    onPressed: saving.contains(id)
                                        ? null
                                        : () => favorite(c),
                                    icon: Icon(
                                      isFavorite
                                          ? Icons.star_rounded
                                          : Icons.star_outline_rounded,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .primary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          Expanded(
                            child: ValueListenableBuilder<double>(
                              valueListenable: offset,
                              builder: (_, x, _) => timeline(
                                c,
                                x,
                                constraints.maxWidth - channelWidth,
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
              ),
            ),
            if (!loading && channels.isEmpty && error == null)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No channels match. Try another search or turn off Favourites.',
                ),
              ),
          ],
        ),
      ),
    );
  }
}
