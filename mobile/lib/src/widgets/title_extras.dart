import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../services/trailer_launcher.dart';
import 'nex_notice.dart';

import '../models/content.dart';
import '../state/app_controller.dart';
import 'skeleton.dart';

class TitleExtras extends ConsumerStatefulWidget {
  const TitleExtras({super.key, required this.item, this.trailerOnly = false});
  final ContentItem item;
  final bool trailerOnly;
  @override
  ConsumerState<TitleExtras> createState() => _TitleExtrasState();
}

class _TitleExtrasState extends ConsumerState<TitleExtras> {
  late Future<Map<String, dynamic>> request;
  final seasons = <int, Future<Map<String, dynamic>>>{};
  int? selected;
  final seasonAnchors = <int, GlobalKey>{};
  void toggleSeason(int number) {
    final anchor = seasonAnchors[number]?.currentContext;
    final box = anchor?.findRenderObject() as RenderBox?;
    final y = box?.localToGlobal(Offset.zero).dy;
    final position = anchor == null
        ? null
        : Scrollable.maybeOf(anchor)?.position;
    setState(() {
      selected = selected == number ? null : number;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || y == null || position == null || !position.hasPixels) {
        return;
      }
      final current =
          seasonAnchors[number]?.currentContext?.findRenderObject()
              as RenderBox?;
      if (current != null && current.attached) {
        position.jumpTo(
          (position.pixels + current.localToGlobal(Offset.zero).dy - y).clamp(
            position.minScrollExtent,
            position.maxScrollExtent,
          ),
        );
      }
    });
  }

  String? openingTrailer;
  final launcher = TrailerLauncher();
  String dateLabel(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '');
    return date == null ? '' : DateFormat.yMMMd().format(date);
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    request = ref.read(appControllerProvider).demoMode
        ? Future.value({'videos': [], 'seasons': []})
        : ref
              .read(nexApiClientProvider)
              .object(
                '/api/title/${widget.item.mediaType.name}/${widget.item.id}/extras',
              );
  }

  @override
  void didUpdateWidget(covariant TitleExtras oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.key != widget.item.key) {
      seasons.clear();
      selected = null;
      load();
    }
  }

  Future<Map<String, dynamic>> season(int n) => seasons.putIfAbsent(
    n,
    () => ref
        .read(nexApiClientProvider)
        .object('/api/title/series/${widget.item.id}/seasons/$n'),
  );
  Widget videos(List rows) => Column(
    children: [
      videoTiles(rows.take(1).toList()),
      if (rows.length > 1)
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: Text('More trailers (${rows.length - 1})'),
          children: [videoTiles(rows.skip(1).toList())],
        ),
    ],
  );
  Widget videoTiles(List rows) => Column(
    children: rows
        .map(
          (v) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.play_circle_outline),
            trailing: Icon(
              openingTrailer == v['url']
                  ? Icons.hourglass_top_rounded
                  : Icons.open_in_new,
              size: 18,
            ),
            title: Text(v['name'] as String),
            subtitle: Text(
              '${v['type']} · YouTube${v['official'] == true ? ' · Official' : ''}',
            ),
            onTap: openingTrailer != null
                ? null
                : () => openTrailer(v['url'] as String? ?? ''),
          ),
        )
        .toList(),
  );
  Future<void> openTrailer(String url) async {
    setState(() => openingTrailer = url);
    final result = await launcher.open(url);
    if (!mounted) return;
    setState(() => openingTrailer = null);
    if (result == TrailerLaunchResult.opened) return;
    final message = switch (result) {
      TrailerLaunchResult.bridgeUnavailable => 'The phone’s link launcher did not respond. You can copy the trailer link.',
      TrailerLaunchResult.invalidLink => 'This trailer link is unavailable.',
      _ => 'No browser could open this trailer. You can copy its link.',
    };
    showNexNotice(
      context,
      message,
      action: TrailerLauncher.validatedUrl(url) == null
          ? null
          : SnackBarAction(
              label: 'Copy link',
              onPressed: () async {
                await Clipboard.setData(
                  ClipboardData(
                    text: TrailerLauncher.validatedUrl(url).toString(),
                  ),
                );
                if (mounted) {
                  showNexNotice(context, 'Trailer link copied.');
                }
              },
            ),
    );
  }

  Widget loading() => widget.trailerOnly
      ? const NexSkeleton(child: SkeletonBlock(height: 48))
      : const NexSkeleton(
          child: Column(
            children: [
              SkeletonBlock(height: 56),
              SizedBox(height: 12),
              SkeletonBlock(height: 56),
            ],
          ),
        );
  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: request,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) return loading();
      if (snapshot.hasError) {
        return TextButton.icon(
          onPressed: () => setState(load),
          icon: const Icon(Icons.refresh),
          label: Text(
            widget.trailerOnly ? 'Retry trailer' : 'Retry trailers and seasons',
          ),
        );
      }
      final data = snapshot.data!;
      final trailers = data['videos'] as List? ?? [];
      final summaries = data['seasons'] as List? ?? [];
      if (widget.trailerOnly) {
        final available = trailers
            .where(
              (v) =>
                  TrailerLauncher.validatedUrl(v['url'] as String? ?? '') !=
                  null,
            )
            .toList();
        final trailer =
            available.where((v) => v['type'] == 'Trailer').firstOrNull ??
            available.firstOrNull;
        return OutlinedButton.icon(
          icon: Icon(
            openingTrailer == null
                ? Icons.play_circle_outline
                : Icons.hourglass_top_rounded,
          ),
          label: Text(
            trailer == null
                ? 'No trailer available'
                : openingTrailer == null
                ? 'Watch trailer'
                : 'Opening trailer…',
          ),
          onPressed: trailer == null || openingTrailer != null
              ? null
              : () => openTrailer(trailer['url'] as String),
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (trailers.isNotEmpty) ...[
            Text('Trailers', style: Theme.of(context).textTheme.titleLarge),
            videos(trailers),
          ],
          if (summaries.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('Seasons', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final s in summaries)
              Card(
                key: ValueKey('season-card-${s['number']}'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    children: [
                      ListTile(
                        key: seasonAnchors.putIfAbsent(
                          s['number'] as int,
                          () => GlobalKey(),
                        ),
                        contentPadding: EdgeInsets.zero,
                        title: Text(s['name'] as String),
                        subtitle: Text('${s['episodeCount']} episodes'),
                        trailing: Icon(
                          selected == s['number']
                              ? Icons.expand_less
                              : Icons.expand_more,
                        ),
                        onTap: () => toggleSeason(s['number'] as int),
                      ),
                      if (selected == s['number'])
                        FutureBuilder<Map<String, dynamic>>(
                          key: ValueKey(selected),
                          future: season(selected!),
                          builder: (context, details) {
                            if (details.connectionState !=
                                ConnectionState.done) {
                              return Padding(
                                padding: const EdgeInsets.only(top: 16),
                                child: loading(),
                              );
                            }
                            if (details.hasError) {
                              return TextButton(
                                onPressed: () =>
                                    setState(() => seasons.remove(selected)),
                                child: const Text('Retry season'),
                              );
                            }
                            final episodes =
                                details.data!['episodes'] as List? ?? [];
                            final seasonVideos =
                                details.data!['videos'] as List? ?? [];
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (seasonVideos.isNotEmpty) ...[
                                  const SizedBox(height: 16),
                                  Text(
                                    'Season trailers',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium,
                                  ),
                                  videos(seasonVideos),
                                ],
                                if (episodes.isEmpty)
                                  const Padding(
                                    padding: EdgeInsets.all(16),
                                    child: Text('No episodes reported yet.'),
                                  ),
                                ...episodes.map(
                                  (e) => ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: Text(
                                      '${e['number']}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleLarge,
                                    ),
                                    title: Text(e['name'] as String),
                                    subtitle: Text(
                                      [
                                        if (e['runtimeMinutes'] != null)
                                          '${e['runtimeMinutes']} min',
                                        if (e['rating'] != null)
                                          '${(e['rating'] as num).toStringAsFixed(1)}/10',
                                        if (e['airDate'] != null)
                                          dateLabel(e['airDate']),
                                      ].join(' · '),
                                    ),
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ],
      );
    },
  );
}
