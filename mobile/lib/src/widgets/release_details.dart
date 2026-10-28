import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../models/content.dart';
import '../state/app_controller.dart';
import '../services/release_notification_service.dart';
import 'nex_notice.dart';
import 'skeleton.dart';
import 'cinema_details.dart';

String displayReleaseDate(String? value) {
  final date = DateTime.tryParse(value ?? '');
  return date == null ? 'Date not listed yet' : DateFormat.yMMMd().format(date);
}

class ReleaseDetails extends ConsumerStatefulWidget {
  const ReleaseDetails({super.key, required this.item});
  final ContentItem item;
  @override
  ConsumerState<ReleaseDetails> createState() => _ReleaseDetailsState();
}

class _ReleaseDetailsState extends ConsumerState<ReleaseDetails> {
  late Future<Map<String, dynamic>> request;
  final Map<String, bool> followOverrides = {};
  final Set<String> savingKinds = {};
  int generation = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void didUpdateWidget(covariant ReleaseDetails oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.key != widget.item.key) load();
  }

  void load() {
    generation++;
    followOverrides.clear();
    savingKinds.clear();
    request = ref.read(appControllerProvider).demoMode
        ? Future.value({'releases': []})
        : ref
              .read(nexApiClientProvider)
              .object(
                '/api/title/${widget.item.mediaType.name}/${widget.item.id}/releases',
              );
  }

  Future<void> follow(String kind, bool enabled) async {
    if (savingKinds.contains(kind)) return;
    final ticket = generation;
    final previous = followOverrides[kind];
    final api = ref.read(nexApiClientProvider);
    setState(() {
      followOverrides[kind] = enabled;
      savingKinds.add(kind);
    });
    try {
      await api.setReleaseFollow(widget.item, kind, enabled);
    } catch (_) {
      if (!mounted || ticket != generation) return;
      setState(() {
        if (previous == null) {
          followOverrides.remove(kind);
        } else {
          followOverrides[kind] = previous;
        }
        savingKinds.remove(kind);
      });
      showNexNotice(context, 'Could not update this alert. Please try again.');
      return;
    }
    if (!mounted || ticket != generation) return;
    setState(() => savingKinds.remove(kind));
    // Keep the loaded dates in place. OS permission affects popups, not the
    // subscription already saved to the inbox.
    if (enabled) {
      final allowed = await ReleaseNotificationService.instance.enable();
      if (!mounted || ticket != generation || followOverrides[kind] != true) {
        return;
      }
      showNexNotice(
        context,
        allowed
            ? 'Alert saved. New updates appear when Nex syncs.'
            : 'Alert saved in Notifications. Phone popups are off.',
      );
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
      final cinema = data['cinema'] as Map?;
      final hasCinema = (cinema?['listings'] as List? ?? []).any(
        (r) => r['status'] == 'listed' || r['status'] == 'upcoming',
      );
      final day =
          data['day'] as String? ??
          DateTime.now().toIso8601String().substring(0, 10);
      final releases = (data['releases'] as List? ?? [])
          .where(
            (r) =>
                r['date'] == null || (r['date'] as String).compareTo(day) >= 0,
          )
          .toList();
      final subscriptions = [
        for (final s in data['subscriptions'] as List? ?? [])
          if (!followOverrides.containsKey(s['kind'])) s,
        for (final entry in followOverrides.entries)
          {'kind': entry.key, 'enabled': entry.value},
      ];
      final alertKinds = ['cinema', 'digital'].where((kind) {
        // A toggled control stays available so the user can change it back.
        if (followOverrides.containsKey(kind)) return true;
        if (subscriptions.any(
          (s) => s['kind'] == kind && s['enabled'] == true,
        )) {
          return true;
        }
        final dates = (data['releases'] as List? ?? [])
            .where((r) => r['kind'] == kind)
            .toList();
        if (dates.any(
          (r) =>
              r['alertEligible'] != false &&
              r['date'] != null &&
              (r['date'] as String).compareTo(day) > 0,
        )) {
          return true;
        }
        if (dates.isEmpty &&
            (widget.item.releaseDate == null ||
                widget.item.releaseDate!.compareTo(day) < 0)) {
          return false;
        }
        return !dates.any(
          (r) => r['date'] != null && (r['date'] as String).compareTo(day) <= 0,
        );
      }).toList();
      if (releases.isEmpty &&
          !hasCinema &&
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
            if (releases.isEmpty && !hasCinema)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Our data source has no upcoming local date yet. A cinema or distributor may already have announced one.',
                ),
              ),
            if (widget.item.mediaType == MediaType.movie &&
                widget.item.releaseDate != null &&
                widget.item.releaseDate!.compareTo(day) > 0 &&
                !hasCinema &&
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
                onPressed: savingKinds.contains('season')
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
                      ? (r['reissue'] == true
                            ? 'Back in cinemas'
                            : 'In cinemas')
                      : 'Digital release',
                ),
                subtitle: Text(
                  '${r['date'] == null ? '' : 'Expected '}${displayReleaseDate(r['date'] as String?)}',
                ),
              ),
            if (hasCinema) CinemaDetails(data: cinema!),
            if (releases.isNotEmpty)
              const Text(
                'Dates may change. A premiere or digital release does not confirm availability on your subscriptions.',
              ),
            if (widget.item.mediaType == MediaType.movie &&
                alertKinds.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final stacked =
                        constraints.maxWidth < 300 ||
                        MediaQuery.textScalerOf(context).scale(14) > 18;
                    final width = stacked || alertKinds.length == 1
                        ? constraints.maxWidth
                        : (constraints.maxWidth - 12) / 2;
                    return Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        for (final kind in alertKinds)
                          SizedBox(
                            width: width,
                            child: _ReleaseAlertButton(
                              kind: kind,
                              enabled: subscriptions.any(
                                (s) =>
                                    s['kind'] == kind && s['enabled'] == true,
                              ),
                              saving: savingKinds.contains(kind),
                              onPressed: savingKinds.contains(kind)
                                  ? null
                                  : () => follow(
                                      kind,
                                      !subscriptions.any(
                                        (s) =>
                                            s['kind'] == kind &&
                                            s['enabled'] == true,
                                      ),
                                    ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
          ],
        ),
      );
    },
  );
}

class _ReleaseAlertButton extends StatelessWidget {
  const _ReleaseAlertButton({
    required this.kind,
    required this.enabled,
    required this.saving,
    required this.onPressed,
  });

  final String kind;
  final bool enabled;
  final bool saving;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final title = kind == 'cinema' ? 'Cinema' : 'Digital';
    final foreground = enabled ? colors.onPrimaryContainer : colors.onSurface;
    return Semantics(
      toggled: enabled,
      label: '$title release alert',
      hint: enabled ? 'Turn off this alert' : 'Notify me about this release',
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 80),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          foregroundColor: foreground,
          backgroundColor: enabled
              ? colors.primaryContainer
              : colors.surfaceContainerLow,
          side: BorderSide(
            color: enabled ? colors.primary : colors.outlineVariant,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
        onPressed: onPressed,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  kind == 'cinema'
                      ? Icons.theaters_outlined
                      : Icons.play_circle_outline,
                  size: 21,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    saving
                        ? 'Saving…'
                        : enabled
                        ? 'Alert on'
                        : 'Notify me',
                    style: TextStyle(
                      fontSize: 12,
                      color: enabled ? foreground : colors.onSurfaceVariant,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  enabled
                      ? Icons.check_rounded
                      : Icons.notifications_none_rounded,
                  size: 18,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
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
      subtitle: const Text(
        'Save new seasons of Seen series to Notifications. Popups appear when Nex syncs.',
      ),
      value: enabled ?? false,
      onChanged: enabled == null || saving
          ? null
          : (value) async {
              setState(() => saving = true);
              try {
                final api = ref.read(nexApiClientProvider);
                await api.setSeriesAlerts(value);
                if (value) await ReleaseNotificationService.instance.enable();
                if (mounted) setState(() => enabled = value);
              } catch (_) {
                if (context.mounted) {
                  showNexNotice(context, 'Could not save. Please try again.');
                }
              } finally {
                if (mounted) setState(() => saving = false);
              }
            },
    );
  }
}
