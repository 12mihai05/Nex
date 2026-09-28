import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../models/content.dart';
import '../models/tv_program.dart';
import '../state/app_controller.dart';
import 'skeleton.dart';

class TitleBroadcasts extends ConsumerStatefulWidget {
  const TitleBroadcasts({super.key, required this.item});
  final ContentItem item;
  @override
  ConsumerState<TitleBroadcasts> createState() => _TitleBroadcastsState();
}

class _TitleBroadcastsState extends ConsumerState<TitleBroadcasts> {
  late Future<List<TvProgram>> request;
  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    request = ref.read(appControllerProvider).demoMode
        ? Future.value(<TvProgram>[])
        : ref
              .read(nexApiClientProvider)
              .list(
                '/api/title/${widget.item.mediaType.name}/${widget.item.id}/broadcasts',
              )
              .then((rows) => rows.map(TvProgram.fromJson).toList());
  }

  @override
  void didUpdateWidget(covariant TitleBroadcasts oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.key != widget.item.key) load();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(
      appControllerProvider.select(
        (s) => (s.country, s.demoMode, s.authenticated),
      ),
      (old, next) {
        if (old != next) setState(load);
      },
    );
    return FutureBuilder<List<TvProgram>>(
      future: request,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const NexSkeleton(
            child: ChannelListSkeleton(schedule: true, height: 180),
          );
        }
        if (snapshot.hasError) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('TV listings could not be checked.'),
              TextButton(
                onPressed: () => setState(load),
                child: const Text('Retry'),
              ),
            ],
          );
        }
        final programmes = snapshot.data ?? [];
        if (programmes.isEmpty) {
          return const ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.tv_outlined),
            title: Text('No verified broadcasts in the available guide'),
            subtitle: Text(
              'Listings may be incomplete. This does not mean it isn’t airing.',
            ),
          );
        }
        return Column(
          children: programmes
              .map(
                (p) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(p.isLive ? Icons.live_tv : Icons.tv_outlined),
                  title: Text(broadcastLabel(p)),
                  subtitle: Text(
                    '${p.isLive ? 'LIVE · ' : ''}${DateFormat.MMMd().add_Hm().format(p.startsAt)}–${DateFormat.Hm().format(p.endsAt)}\n${p.title}',
                  ),
                  isThreeLine: true,
                ),
              )
              .toList(),
        );
      },
    );
  }
}

String broadcastLabel(TvProgram program, {DateTime? now}) {
  final today = now ?? DateTime.now();
  if (!program.startsAt.isAfter(today) && program.endsAt.isAfter(today)) {
    return 'Live now on ${program.channel}';
  }
  final days = DateTime.utc(
    program.startsAt.year,
    program.startsAt.month,
    program.startsAt.day,
  ).difference(DateTime.utc(today.year, today.month, today.day)).inDays;
  final when = days <= 0
      ? 'Today'
      : days == 1
      ? 'Tomorrow'
      : 'In $days days';
  return '$when on ${program.channel}';
}
