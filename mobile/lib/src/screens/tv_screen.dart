import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/api_client.dart';
import '../data/demo_data.dart';
import '../models/tv_program.dart';
import '../state/app_controller.dart';

class TvScreen extends ConsumerStatefulWidget {
  const TvScreen({super.key, this.active = true});
  final bool active;
  @override
  ConsumerState<TvScreen> createState() => _TvScreenState();
}

class _TvScreenState extends ConsumerState<TvScreen> {
  List<TvProgram> live = [], upcoming = [];
  List<Map<String, dynamic>> channels = [];
  final demoFavorites = <String>{};
  bool loading = false, onlyFavorites = false, more = false;
  String? error, country;
  String query = '';
  int generation = 0;
  Timer? debounce, clock;
  final saving = <String>{};
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.active) load();
    });
    clock = Timer.periodic(const Duration(minutes: 1), (_) {
      if (widget.active && !loading) load();
    });
  }

  @override
  void didUpdateWidget(TvScreen old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) load();
  }

  @override
  void dispose() {
    debounce?.cancel();
    clock?.cancel();
    generation++;
    super.dispose();
  }

  Future<void> load({bool next = false}) async {
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
        final results = await Future.wait([
          api.tvDiscover(),
          api.list(
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
        live = parse('live');
        upcoming = parse('upcoming');
        final page = results[1] as List<Map<String, dynamic>>;
        channels = next ? [...channels, ...page] : page;
        more = page.length == 50;
      }
    } catch (e) {
      if (mounted && ticket == generation) error = readableApiError(e);
    } finally {
      if (mounted && ticket == generation) setState(() => loading = false);
    }
  }

  Future<void> favorite(String id, bool value) async {
    if (saving.contains(id)) return;
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
      if (mounted) await load();
    } catch (e) {
      if (mounted) setState(() => error = readableApiError(e));
    } finally {
      if (mounted) setState(() => saving.remove(id));
    }
  }

  bool isFavorite(TvProgram p) => ref.read(appControllerProvider).demoMode
      ? demoFavorites.contains(p.channel)
      : p.favorite;
  List<TvProgram> preview(List<TvProgram> items) {
    final valid = items.where((p) => p.endsAt.isAfter(DateTime.now())).toList();
    final keys = valid
        .where((p) => !isFavorite(p))
        .take(2)
        .map((p) => p.id)
        .toSet();
    for (final p in valid) {
      if (keys.length < 6) keys.add(p.id);
    }
    return valid.where((p) => keys.contains(p.id)).toList();
  }

  Future<void> reminder(TvProgram p) async {
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
              onPressed: () => reminder(p),
            ),
        ],
      ),
    ),
  );
  Widget heading(String text) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 24, 4, 8),
    child: Text(text, style: Theme.of(context).textTheme.titleLarge),
  );
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
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
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Center(child: Text(state.country)),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          children: [
            if (loading) const LinearProgressIndicator(),
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
            heading('Live now'),
            if (live.isEmpty && !loading)
              const Text('No current listings available.'),
            ...preview(live).map(programme),
            for (final bucket in [
              (0, 30, 'Next 30 minutes'),
              (30, 60, '30–60 minutes'),
              (60, 720, 'Later · next 12 hours'),
            ]) ...[
              if (upcoming.any((p) {
                final m = p.startsAt.difference(now).inSeconds / 60;
                return m >= bucket.$1 && m < bucket.$2;
              }))
                heading(bucket.$3),
              ...preview(
                upcoming.where((p) {
                  final m = p.startsAt.difference(now).inSeconds / 60;
                  return m >= bucket.$1 && m < bucket.$2;
                }).toList(),
              ).map(programme),
            ],
            heading('Channel guide'),
            const Text(
              'Favorites come first. Channels without listings stay visible; favoriting requests their schedule on the next sync. Up to 20 favorites per country.',
            ),
            const SizedBox(height: 12),
            TextField(
              decoration: const InputDecoration(
                hintText: 'Find a channel',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (value) {
                query = value;
                debounce?.cancel();
                debounce = Timer(
                  const Duration(milliseconds: 350),
                  () => load(),
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
                  load();
                },
              ),
            ),
            if (channels.isEmpty && !loading)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'No channels found. Try another search or refresh after sync.',
                ),
              ),
            ...channels.map(
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
                  tooltip: c['favorite'] == true
                      ? 'Unfavorite channel'
                      : 'Favorite channel',
                  onPressed: saving.contains(c['id'])
                      ? null
                      : () =>
                            favorite(c['id'] as String, c['favorite'] != true),
                  icon: Icon(
                    c['favorite'] == true ? Icons.star : Icons.star_border,
                  ),
                ),
                onTap: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  showDragHandle: true,
                  builder: (_) => ChannelSchedule(
                    channel: c,
                    programBuilder: (p) => programme(p, channelControls: false),
                  ),
                ),
              ),
            ),
            if (more)
              TextButton(
                onPressed: loading ? null : () => load(next: true),
                child: const Text('Load more channels'),
              ),
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
          if (busy) const LinearProgressIndicator(),
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
