import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/content.dart';
import '../state/app_controller.dart';
import 'skeleton.dart';

class TitleExtras extends ConsumerStatefulWidget {
  const TitleExtras({super.key, required this.item});
  final ContentItem item;
  @override
  ConsumerState<TitleExtras> createState() => _TitleExtrasState();
}

class _TitleExtrasState extends ConsumerState<TitleExtras> {
  late Future<Map<String, dynamic>> request;
  final seasons = <int, Future<Map<String, dynamic>>>{};
  int? selected;
  int visibleEpisodes = 20;
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
            trailing: const Icon(Icons.open_in_new, size: 18),
            title: Text(v['name'] as String),
            subtitle: Text(
              '${v['type']} · YouTube${v['official'] == true ? ' · Official' : ''}',
            ),
            onTap: () async {
              final uri = Uri.tryParse(v['url'] as String? ?? '');
              bool opened = false;
              try {
                if (uri != null &&
                    uri.scheme == 'https' &&
                    uri.host == 'www.youtube.com') {
                  opened = await launchUrl(
                    uri,
                    mode: LaunchMode.externalApplication,
                  );
                }
              } catch (_) {
                /* Recover below. */
              }
              if (!opened && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Could not open this trailer. Please try again.',
                    ),
                  ),
                );
              }
            },
          ),
        )
        .toList(),
  );
  Widget loading() => const NexSkeleton(
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
          label: const Text('Retry trailers and seasons'),
        );
      }
      final data = snapshot.data!;
      final trailers = data['videos'] as List? ?? [];
      final summaries = data['seasons'] as List? ?? [];
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (trailers.isNotEmpty) ...[
            Text('Trailers', style: Theme.of(context).textTheme.titleLarge),
            videos(trailers),
          ],
          if (summaries.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(
              '${summaries.where((s) => s['number'] != 0).length} ${summaries.where((s) => s['number'] != 0).length == 1 ? "season" : "seasons"}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: selected,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Explore a season'),
              items: summaries
                  .map(
                    (s) => DropdownMenuItem<int>(
                      value: s['number'] as int,
                      child: Text(
                        '${s['name']} · ${s['episodeCount']} episodes',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (value) => setState(() {
                selected = value;
                visibleEpisodes = 20;
              }),
            ),
            if (selected != null)
              FutureBuilder<Map<String, dynamic>>(
                key: ValueKey(selected),
                future: season(selected!),
                builder: (context, details) {
                  if (details.connectionState != ConnectionState.done) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: loading(),
                    );
                  }
                  if (details.hasError) {
                    return TextButton(
                      onPressed: () => setState(() => seasons.remove(selected)),
                      child: const Text('Retry season'),
                    );
                  }
                  final episodes = details.data!['episodes'] as List? ?? [];
                  final seasonVideos = details.data!['videos'] as List? ?? [];
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (seasonVideos.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Text(
                          'Season trailers',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        videos(seasonVideos),
                      ],
                      if (episodes.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('No episodes reported yet.'),
                        ),
                      ...episodes
                          .take(visibleEpisodes)
                          .map(
                            (e) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Text(
                                '${e['number']}',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              title: Text(e['name'] as String),
                              subtitle: Text(
                                [
                                  if (e['runtimeMinutes'] != null)
                                    '${e['runtimeMinutes']} min',
                                  if (e['rating'] != null)
                                    '${(e['rating'] as num).toStringAsFixed(1)}/10',
                                  if (e['airDate'] != null)
                                    e['airDate'] as String,
                                ].join(' · '),
                              ),
                            ),
                          ),
                      if (episodes.length > visibleEpisodes)
                        TextButton(
                          onPressed: () =>
                              setState(() => visibleEpisodes += 20),
                          child: Text(
                            'More episodes (${episodes.length - visibleEpisodes} remaining)',
                          ),
                        ),
                    ],
                  );
                },
              ),
          ],
        ],
      );
    },
  );
}
