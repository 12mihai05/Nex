import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../models/content.dart';
import '../state/app_controller.dart';
import '../services/release_push_service.dart';
import 'nex_notice.dart';
import 'skeleton.dart';

String displayReleaseDate(String? value) {
  final date = DateTime.tryParse(value ?? '');
  return date == null ? 'Date not announced' : DateFormat.yMMMd().format(date);
}

class ReleaseDetails extends ConsumerStatefulWidget {
  const ReleaseDetails({super.key, required this.item});
  final ContentItem item;
  @override
  ConsumerState<ReleaseDetails> createState() => _ReleaseDetailsState();
}

class _ReleaseDetailsState extends ConsumerState<ReleaseDetails> {
  late Future<Map<String, dynamic>> request;
  bool saving = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    request = ref.read(appControllerProvider).demoMode
        ? Future.value({'releases': []})
        : ref
              .read(nexApiClientProvider)
              .object(
                '/api/title/${widget.item.mediaType.name}/${widget.item.id}/releases',
              );
  }

  Future<void> follow(String kind, bool enabled) async {
    setState(() => saving = true);
    try {
      final api = ref.read(nexApiClientProvider);
      if (enabled) {
        if (!ReleasePushService.configured) {
          if (mounted) {
            showNexNotice(
              context,
              'Release alerts are not configured yet. Dates are still available here.',
            );
          }
          return;
        }
        if (!await ReleasePushService.instance.enable(api)) {
          if (mounted) {
            showNexNotice(
              context,
              'Allow notifications in your phone settings to receive release alerts.',
            );
          }
          return;
        }
      }
      await api.setReleaseFollow(widget.item, kind, enabled);
      if (mounted) setState(load);
    } catch (_) {
      if (mounted) {
        showNexNotice(
          context,
          'Could not update this alert. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: request,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: NexSkeleton(child: SkeletonBlock(height: 72)),
        );
      }
      if (snapshot.hasError) {
        return TextButton.icon(
          onPressed: () => setState(load),
          icon: const Icon(Icons.refresh),
          label: const Text('Retry release dates'),
        );
      }
      final data = snapshot.data ?? {};
      final day =
          data['day'] as String? ??
          DateTime.now().toIso8601String().substring(0, 10);
      final releases = (data['releases'] as List? ?? [])
          .where(
            (r) =>
                r['date'] == null || (r['date'] as String).compareTo(day) >= 0,
          )
          .toList();
      final subscriptions = data['subscriptions'] as List? ?? [];
      if (releases.isEmpty &&
          subscriptions.isEmpty &&
          (widget.item.mediaType == MediaType.series ||
              (widget.item.releaseDate != null &&
                  widget.item.releaseDate!.compareTo(day) < 0))) {
        return const SizedBox.shrink();
      }
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.item.mediaType == MediaType.series
                  ? 'Coming next'
                  : 'Release dates · ${data['country'] ?? ''}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (releases.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'No upcoming cinema or digital date listed for your country.',
                ),
              ),
            if (widget.item.mediaType == MediaType.movie &&
                widget.item.releaseDate != null &&
                widget.item.releaseDate!.compareTo(day) > 0 &&
                releases.isEmpty)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('First listed release'),
                subtitle: Text(
                  '${displayReleaseDate(widget.item.releaseDate)} · Not a confirmed date for your country',
                ),
              ),
            if (widget.item.mediaType == MediaType.series &&
                subscriptions.any((s) => s['kind'] == 'season'))
              OutlinedButton.icon(
                onPressed: saving
                    ? null
                    : () => follow(
                        'season',
                        !subscriptions.any(
                          (s) => s['kind'] == 'season' && s['enabled'] == true,
                        ),
                      ),
                icon: const Icon(Icons.notifications_outlined),
                label: Text(
                  subscriptions.any(
                        (s) => s['kind'] == 'season' && s['enabled'] == true,
                      )
                      ? 'Pause alerts for this series'
                      : 'Resume alerts for this series',
                ),
              ),
            for (final r in releases)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_outlined),
                title: Text(
                  r['kind'] == 'season'
                      ? 'Season ${r['season']}'
                      : r['kind'] == 'cinema'
                      ? 'In cinemas'
                      : 'Digital release',
                ),
                subtitle: Text(
                  '${r['date'] == null ? '' : 'Expected '}${displayReleaseDate(r['date'] as String?)}',
                ),
              ),
            if (releases.isNotEmpty)
              const Text(
                'Dates may change. A premiere or digital release does not confirm availability on your subscriptions.',
              ),
            if (widget.item.mediaType == MediaType.movie)
              for (final kind in ['cinema', 'digital'])
                Builder(
                  builder: (context) {
                    final enabled = subscriptions.any(
                      (s) => s['kind'] == kind && s['enabled'] == true,
                    );
                    final dates = (data['releases'] as List? ?? [])
                        .where((r) => r['kind'] == kind)
                        .toList();
                    if (!enabled &&
                        dates.isEmpty &&
                        (widget.item.releaseDate == null ||
                            widget.item.releaseDate!.compareTo(day) < 0)) {
                      return const SizedBox.shrink();
                    }
                    if (!enabled &&
                        dates.any(
                          (r) =>
                              r['date'] != null &&
                              (r['date'] as String).compareTo(day) <= 0,
                        )) {
                      return const SizedBox.shrink();
                    }
                    return OutlinedButton.icon(
                      onPressed: saving ? null : () => follow(kind, !enabled),
                      icon: Icon(
                        enabled
                            ? Icons.notifications_active_outlined
                            : Icons.notifications_none,
                      ),
                      label: Text(
                        enabled
                            ? 'Stop $kind alert'
                            : 'Notify me · $kind release',
                      ),
                    );
                  },
                ),
          ],
        ),
      );
    },
  );
}

class SeriesAlertSetting extends ConsumerStatefulWidget {
  const SeriesAlertSetting({super.key});
  @override
  ConsumerState<SeriesAlertSetting> createState() => _SeriesAlertSettingState();
}

class _SeriesAlertSettingState extends ConsumerState<SeriesAlertSetting> {
  bool? enabled;
  bool saving = false;
  bool failed = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final data = await ref
          .read(nexApiClientProvider)
          .object('/api/me/release-settings');
      if (mounted) {
        setState(() {
          enabled = data['followSeenSeries'] == true;
          failed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (ref.watch(appControllerProvider).demoMode) {
      return const SizedBox.shrink();
    }
    if (failed) {
      return TextButton(
        onPressed: load,
        child: const Text('Retry release settings'),
      );
    }
    return SwitchListTile(
      title: const Text('New seasons'),
      subtitle: Text(
        ReleasePushService.configured
            ? 'Notify me about new seasons of series in Seen.'
            : 'Firebase setup needed for phone alerts.',
      ),
      value: enabled ?? false,
      onChanged: enabled == null || saving
          ? null
          : (value) async {
              setState(() => saving = true);
              try {
                final api = ref.read(nexApiClientProvider);
                if (value && !await ReleasePushService.instance.enable(api)) {
                  if (context.mounted) {
                    showNexNotice(
                      context,
                      'Notification permission is needed.',
                    );
                  }
                  return;
                }
                await api.setSeriesAlerts(value);
                if (mounted) setState(() => enabled = value);
              } catch (_) {
                if (context.mounted) {
                  showNexNotice(
                    context,
                    ReleasePushService.configured
                        ? 'Could not save. Please try again.'
                        : 'Release alerts need Firebase configuration first.',
                  );
                }
              } finally {
                if (mounted) setState(() => saving = false);
              }
            },
    );
  }
}
