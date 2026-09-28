import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/api_client.dart';
import '../data/demo_data.dart';
import '../data/countries.dart';
import '../models/tv_program.dart';
import '../state/app_controller.dart';
import '../widgets/skeleton.dart';
import '../state/channel_favorites.dart';
import 'tv_window_screen.dart';

class TvScreen extends ConsumerStatefulWidget {
  const TvScreen({super.key, this.active = true, this.initialGuide = false});
  final bool active;
  final bool initialGuide;
  @override
  ConsumerState<TvScreen> createState() => _TvScreenState();
}

class _TvScreenState extends ConsumerState<TvScreen> {
  List<TvProgram> live = [], upcoming = [];
  List<Map<String, dynamic>> channels = [];
  final demoFavorites = <String>{};
  bool loading = false, onlyFavorites = false, more = false;
  late bool guideOnly = widget.initialGuide;
  final searchInput = TextEditingController();
  final guideCache =
      <String, ({DateTime at, List<Map<String, dynamic>> data})>{};
  DateTime? loadedAt;
  String? error, country;
  String query = '';
  int generation = 0;
  Timer? debounce, clock;
  final saving = <String>{};
  final savingReminders = <String>{};
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.active) load();
    });
    clock = Timer.periodic(const Duration(minutes: 1), (_) {
      if (widget.active && !loading) {
        if (loadedAt == null ||
            DateTime.now().difference(loadedAt!) > const Duration(minutes: 5)) {
          load();
        } else {
          setState(() {});
        }
      }
    });
  }

  @override
  void didUpdateWidget(TvScreen old) {
    super.didUpdateWidget(old);
    if (widget.active &&
        !old.active &&
        (country != ref.read(appControllerProvider).country ||
            loadedAt == null ||
            DateTime.now().difference(loadedAt!) >
                const Duration(minutes: 5))) {
      load();
    }
  }

  @override
  void dispose() {
    debounce?.cancel();
    clock?.cancel();
    searchInput.dispose();
    generation++;
    super.dispose();
  }

  Future<void> load({bool next = false, bool refreshSchedule = true}) async {
    final ticket = ++generation;
    final state = ref.read(appControllerProvider);
    final api = ref.read(nexApiClientProvider);
    final region = state.country;
    setState(() {
      loading = true;
      error = null;
      if (country != region) {
        country = region;
        channels = [];
        live = [];
        upcoming = [];
        guideCache.clear();
        query = '';
        searchInput.clear();
      }
    });
    try {
      if (state.demoMode) {
        final all = demoTvPrograms();
        final now = DateTime.now();
        int compare(TvProgram a, TvProgram b) =>
            (demoFavorites.contains(b.channel) ? 1 : 0) -
                    (demoFavorites.contains(a.channel) ? 1 : 0) !=
                0
            ? (demoFavorites.contains(b.channel) ? 1 : 0) -
                  (demoFavorites.contains(a.channel) ? 1 : 0)
            : a.startsAt.compareTo(b.startsAt);
        live = all.where((p) => p.isLive).toList()..sort(compare);
        upcoming = all.where((p) => p.startsAt.isAfter(now)).toList()
          ..sort(compare);
        channels =
            {
                  for (final p in all)
                    p.channel: {
                      'id': p.channel,
                      'name': p.channel,
                      'favorite': demoFavorites.contains(p.channel),
                      'available': true,
                    },
                }.values
                .where(
                  (c) =>
                      (c['name'] as String).toLowerCase().contains(
                        query.toLowerCase(),
                      ) &&
                      (!onlyFavorites || c['favorite'] == true),
                )
                .toList();
        more = false;
      } else {
        final offset = next ? channels.length : 0;
        final cacheKey = '$region:$query:$onlyFavorites:$offset';
        final cached = guideCache[cacheKey];
        final results = await Future.wait([
          refreshSchedule
              ? api.tvDiscover()
              : Future.value(<String, dynamic>{}),
          cached != null &&
                  DateTime.now().difference(cached.at) <
                      const Duration(minutes: 2)
              ? Future.value(cached.data)
              : api.list(
                  '/api/tv/channels?q=${Uri.encodeQueryComponent(query)}&offset=$offset&favorites=$onlyFavorites',
                ),
        ]);
        if (!mounted ||
            ticket != generation ||
            ref.read(appControllerProvider).country != region) {
          return;
        }
        final data = results[0] as Map<String, dynamic>;
        List<TvProgram> parse(String key) => (data[key] as List)
            .map((p) => TvProgram.fromJson((p as Map).cast<String, dynamic>()))
            .toList();
        if (refreshSchedule) {
          live = parse('live');
          upcoming = parse('upcoming');
        }
        final page = results[1] as List<Map<String, dynamic>>;
        if (guideCache.length >= 20) guideCache.remove(guideCache.keys.first);
        guideCache[cacheKey] = (at: DateTime.now(), data: page);
        channels = next ? [...channels, ...page] : page;
        more = page.length == 50;
        if (refreshSchedule) loadedAt = DateTime.now();
      }
    } catch (e) {
      if (mounted && ticket == generation) error = readableApiError(e);
    } finally {
      if (mounted && ticket == generation) setState(() => loading = false);
    }
  }

  Future<void> favorite(String id, bool value) async {
    if (saving.contains(id)) return;
    final region = ref.read(appControllerProvider).country;
    final scope = ProviderScope.containerOf(context);
    final viewer = ref.read(appControllerProvider);
    final overrides = ref.read(channelOverridesProvider.notifier);
    final previous =
        ref.read(channelOverridesProvider)[id] ??
        channels.where((c) => c['id'] == id).firstOrNull?['favorite']
            as bool? ??
        !value;
    overrides.set(id, value);
    setState(() => saving.add(id));
    try {
      if (ref.read(appControllerProvider).demoMode) {
        if (value) {
          demoFavorites.add(id);
        } else {
          demoFavorites.remove(id);
        }
      } else {
        await ref.read(nexApiClientProvider).setChannelFavorite(id, value);
      }
      if (mounted) guideCache.clear();
    } catch (e) {
      final current = scope.read(appControllerProvider);
      if (current.country == region &&
          current.authenticated == viewer.authenticated &&
          current.demoMode == viewer.demoMode) {
        overrides.set(id, previous);
      }
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(readableApiError(e))));
      }
    } finally {
      if (mounted) setState(() => saving.remove(id));
    }
  }

  bool isFavorite(TvProgram p) =>
      ref.read(channelOverridesProvider)[p.channelId.isEmpty
          ? p.channel
          : p.channelId] ??
      (ref.read(appControllerProvider).demoMode
          ? demoFavorites.contains(p.channel)
          : p.favorite);
  List<TvProgram> preview(List<TvProgram> items) {
    final valid = items.where((p) => p.endsAt.isAfter(DateTime.now())).toList();
    valid.sort((a, b) {
      final favorite = (isFavorite(b) ? 1 : 0) - (isFavorite(a) ? 1 : 0);
      if (favorite != 0) return favorite;
      final time = a.startsAt.compareTo(b.startsAt);
      if (time != 0) return time;
      final channel = a.channel.compareTo(b.channel);
      return channel != 0 ? channel : a.id.compareTo(b.id);
    });
    final keys = valid
        .where((p) => !isFavorite(p))
        .take(2)
        .map((p) => p.id)
        .toSet();
    for (final p in valid) {
      if (keys.length < 12 || isFavorite(p)) keys.add(p.id);
    }
    return valid.where((p) => keys.contains(p.id)).toList();
  }

  Future<void> reminder(TvProgram p) async {
    if (savingReminders.contains(p.id)) return;
    final controller = ref.read(appControllerProvider.notifier);
    final saved = ref
        .read(appControllerProvider)
        .reminderProgramIds
        .contains(p.id);
    final minutes = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final offset in [0, 5, 10])
              ListTile(
                title: Text(
                  offset == 0 ? 'At start' : '$offset minutes before',
                ),
                onTap: () => Navigator.pop(sheet, offset),
              ),
            if (saved)
              ListTile(
                title: const Text('Cancel reminder'),
                onTap: () => Navigator.pop(sheet, -1),
              ),
          ],
        ),
      ),
    );
    if (minutes == null || !mounted) return;
    setState(() => savingReminders.add(p.id));
    try {
      if (minutes < 0) {
        await controller.cancelReminder(p.id);
      } else {
        await controller.setReminder(p, minutes);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              minutes < 0 ? 'Reminder cancelled.' : 'Reminder scheduled.',
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Reminder could not be updated. Check its time and device permissions.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => savingReminders.remove(p.id));
    }
  }

  Widget programme(TvProgram p, {bool channelControls = true}) => Card(
    child: ListTile(
      title: Text(p.title),
      subtitle: Text(
        '${p.channel}\n${p.isLive ? 'LIVE · ' : ''}${DateFormat.Hm().format(p.startsAt)}–${DateFormat.Hm().format(p.endsAt)}',
      ),
      isThreeLine: true,
      onTap: () => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.title, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 12),
                Text(p.description ?? 'No programme description available.'),
                const SizedBox(height: 12),
                Text(
                  '${p.channel} · ${DateFormat.MMMd().add_Hm().format(p.startsAt)}',
                ),
              ],
            ),
          ),
        ),
      ),
      trailing: Wrap(
        children: [
          if (channelControls)
            IconButton(
              tooltip: isFavorite(p)
                  ? 'Unfavorite channel'
                  : 'Favorite channel',
              onPressed: saving.contains(p.channelId)
                  ? null
                  : () => favorite(
                      p.channelId.isEmpty ? p.channel : p.channelId,
                      !isFavorite(p),
                    ),
              icon: Icon(isFavorite(p) ? Icons.star : Icons.star_border),
            ),
          if (p.startsAt.isAfter(DateTime.now()))
            IconButton(
              tooltip: 'Remind me',
              icon: const Icon(Icons.notifications_outlined),
              onPressed: savingReminders.contains(p.id)
                  ? null
                  : () => reminder(p),
            ),
        ],
      ),
    ),
  );
  Widget windowHeading(String text, String bucket) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 20, 0, 8),
    child: Row(
      children: [
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.titleLarge),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => TvWindowScreen(
                title: text,
                bucket: bucket,
                programBuilder: (p) => programme(p),
              ),
            ),
          ),
          child: const Text('See all'),
        ),
      ],
    ),
  );

  Widget heading(String text) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 24, 4, 8),
    child: Text(text, style: Theme.of(context).textTheme.titleLarge),
  );
  Widget shelf(List<TvProgram> programs) => SizedBox(
    height:
        280 + (MediaQuery.textScalerOf(context).scale(100) - 100).clamp(0, 200),
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: programs.length,
      separatorBuilder: (_, _) => const SizedBox(width: 12),
      itemBuilder: (context, index) {
        final p = programs[index];
        final scheme = Theme.of(context).colorScheme;
        return SizedBox(
          width: 270,
          child: Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        p.isLive ? Icons.graphic_eq : Icons.schedule,
                        color: scheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          p.channel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                      ),
                      IconButton(
                        tooltip: isFavorite(p)
                            ? 'Unfavorite channel'
                            : 'Favorite channel',
                        onPressed: saving.contains(p.channelId)
                            ? null
                            : () => favorite(
                                p.channelId.isEmpty ? p.channel : p.channelId,
                                !isFavorite(p),
                              ),
                        icon: Icon(
                          isFavorite(p) ? Icons.star : Icons.star_border,
                          color: scheme.primary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    p.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const Spacer(),
                  Text(
                    '${p.isLive ? 'ON AIR · ' : ''}${DateFormat.Hm().format(p.startsAt)}–${DateFormat.Hm().format(p.endsAt)}',
                    style: TextStyle(
                      color: scheme.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (p.isLive)
                    LinearProgressIndicator(
                      value:
                          (DateTime.now().difference(p.startsAt).inSeconds /
                                  p.endsAt.difference(p.startsAt).inSeconds)
                              .clamp(0, 1),
                      borderRadius: BorderRadius.circular(4),
                    )
                  else
                    TextButton.icon(
                      onPressed: savingReminders.contains(p.id)
                          ? null
                          : () => reminder(p),
                      icon: const Icon(Icons.notifications_outlined),
                      label: Text(
                        savingReminders.contains(p.id)
                            ? 'Saving reminder…'
                            : 'Remind me',
                      ),
                    ),
                  TextButton(
                    onPressed: () => showModalBottomSheet<void>(
                      context: context,
                      showDragHandle: true,
                      builder: (_) => SafeArea(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            p.description ??
                                'No programme description available.',
                          ),
                        ),
                      ),
                    ),
                    child: const Text('Programme details'),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    final overrides = ref.watch(channelOverridesProvider);
    final visibleChannels =
        channels
            .where(
              (c) =>
                  !onlyFavorites ||
                  (overrides[c['id']] ?? c['favorite'] == true),
            )
            .toList()
          ..sort((a, b) {
            final favorite =
                ((overrides[b['id']] ?? b['favorite'] == true) ? 1 : 0) -
                ((overrides[a['id']] ?? a['favorite'] == true) ? 1 : 0);
            if (favorite != 0) return favorite;
            final name = (a['name'] as String).compareTo(b['name'] as String);
            return name != 0
                ? name
                : (a['id'] as String).compareTo(b['id'] as String);
          });
    ref.listen(appControllerProvider.select((s) => s.country), (old, next) {
      if (old != next) {
        generation++;
        setState(() {
          live = [];
          upcoming = [];
          channels = [];
        });
        if (widget.active) load();
      }
    });
    final now = DateTime.now();
    return Scaffold(
      appBar: AppBar(
        title: const Text('TV'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(54),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Row(
              children: [
                Expanded(
                  child: ChoiceChip(
                    label: const Text('On TV'),
                    selected: !guideOnly,
                    onSelected: (_) => setState(() => guideOnly = false),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ChoiceChip(
                    label: const Text('Channel guide'),
                    selected: guideOnly,
                    onSelected: (_) => setState(() => guideOnly = true),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Center(
              child: Text(watchingCountries[state.country] ?? state.country),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () {
          guideCache.clear();
          return load();
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          children: [
            if (error != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    Text(error!),
                    TextButton(
                      onPressed: () => load(),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            if (!guideOnly) ...[
              if (loading && live.isEmpty && upcoming.isEmpty)
                const TvShelvesSkeleton(),
              if (!loading || live.isNotEmpty)
                windowHeading('Live now', 'live'),
              if (live.isEmpty && !loading)
                const Text('No current listings available.'),
              if (live.isNotEmpty) shelf(preview(live)),
              for (final bucket in [
                (0, 30, 'Next 30 minutes'),
                (30, 60, '30–60 minutes'),
                (60, 720, 'Later · next 12 hours'),
              ]) ...[
                windowHeading(
                  bucket.$3,
                  bucket.$1 == 0
                      ? 'soon'
                      : bucket.$1 == 30
                      ? 'next'
                      : 'later',
                ),
                if (upcoming.any((p) {
                  final m = p.startsAt.difference(now).inSeconds / 60;
                  return m >= bucket.$1 && m < bucket.$2;
                }))
                  shelf(
                    preview(
                      upcoming.where((p) {
                        final m = p.startsAt.difference(now).inSeconds / 60;
                        return m >= bucket.$1 && m < bucket.$2;
                      }).toList(),
                    ),
                  ),
              ],
            ],
            if (guideOnly) ...[
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('channel-search'),
                controller: searchInput,
                decoration: const InputDecoration(
                  hintText: 'Find a channel',
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (value) {
                  query = value;
                  generation++;
                  setState(() => loading = true);
                  debounce?.cancel();
                  debounce = Timer(
                    const Duration(milliseconds: 350),
                    () => load(refreshSchedule: false),
                  );
                },
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: FilterChip(
                  label: const Text('Favorites only'),
                  selected: onlyFavorites,
                  onSelected: (v) {
                    setState(() => onlyFavorites = v);
                    load(refreshSchedule: false);
                  },
                ),
              ),
              if (loading) const ChannelListSkeleton(),
              if (visibleChannels.isEmpty && !loading)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'No channels found. Try another search or refresh after sync.',
                  ),
                ),
              if (!loading)
                ...visibleChannels.map(
                  (c) => ListTile(
                    title: Text(c['name'] as String),
                    subtitle: Text(
                      c['available'] == true
                          ? 'Open schedule'
                          : c['active'] == false
                          ? 'No longer in the source · remove from favorites'
                          : 'Schedule unavailable · next sync may add listings',
                    ),
                    trailing: IconButton(
                      tooltip: (overrides[c['id']] ?? c['favorite'] == true)
                          ? 'Unfavorite channel'
                          : 'Favorite channel',
                      onPressed: saving.contains(c['id'])
                          ? null
                          : () => favorite(
                              c['id'] as String,
                              !(overrides[c['id']] ?? c['favorite'] == true),
                            ),
                      icon: Icon(
                        (overrides[c['id']] ?? c['favorite'] == true)
                            ? Icons.star
                            : Icons.star_border,
                      ),
                    ),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      showDragHandle: true,
                      builder: (_) => ChannelSchedule(
                        channel: c,
                        programBuilder: (p) =>
                            programme(p, channelControls: false),
                      ),
                    ),
                  ),
                ),
              if (more)
                TextButton(
                  onPressed: loading
                      ? null
                      : () => load(next: true, refreshSchedule: false),
                  child: const Text('Load more channels'),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class ChannelSchedule extends ConsumerStatefulWidget {
  const ChannelSchedule({
    super.key,
    required this.channel,
    required this.programBuilder,
  });
  final Map<String, dynamic> channel;
  final Widget Function(TvProgram) programBuilder;
  @override
  ConsumerState<ChannelSchedule> createState() => _ChannelScheduleState();
}

class _ChannelScheduleState extends ConsumerState<ChannelSchedule> {
  final List<TvProgram> items = [];
  bool busy = true, more = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => busy = true);
    try {
      final page = ref.read(appControllerProvider).demoMode
          ? demoTvPrograms()
                .where((p) => p.channel == widget.channel['name'])
                .toList()
          : (await ref
                    .read(nexApiClientProvider)
                    .list(
                      '/api/tv/channel-schedule?id=${Uri.encodeQueryComponent(widget.channel['id'] as String)}&offset=${items.length}',
                    ))
                .map(TvProgram.fromJson)
                .toList();
      if (mounted) {
        setState(() {
          items.addAll(page);
          more = page.length == 100;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = readableApiError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * .8,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            widget.channel['name'] as String,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          if (error != null) ...[
            Text(error!),
            TextButton(onPressed: load, child: const Text('Retry')),
          ],
          if (items.isEmpty && !busy && error == null)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'No schedule available. Favorite this channel to request inclusion in the next scheduled sync.',
              ),
            ),
          ...items.map(widget.programBuilder),
          if (busy)
            ChannelListSkeleton(
              schedule: true,
              height: MediaQuery.sizeOf(context).height * .8 - 70,
            ),
          if (more)
            TextButton(
              onPressed: busy ? null : load,
              child: const Text('More programmes'),
            ),
        ],
      ),
    ),
  );
}
