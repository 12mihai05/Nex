import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../state/app_controller.dart';
import '../services/release_notification_service.dart';
import '../widgets/skeleton.dart';
import '../widgets/nex_notice.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  final items = <Map<String, dynamic>>[];
  bool loading = false, more = true, popups = false;
  String? error;
  int offset = 0, generation = 0;
  @override
  void initState() {
    super.initState();
    load();
    ReleaseNotificationService.instance.enabled().then((value) {
      if (mounted) setState(() => popups = value);
    });
  }

  Future<void> load({bool reset = false}) async {
    if (!reset && (loading || !more)) return;
    if (reset) {
      generation++;
      offset = 0;
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
          ? {'items': [], 'hasMore': false}
          : await ref
                .read(nexApiClientProvider)
                .releaseNotifications(offset: offset);
      if (!mounted || ticket != generation) return;
      final rows = (result['items'] as List)
          .map((r) => (r as Map).cast<String, dynamic>())
          .toList();
      setState(() {
        final ids = items.map((r) => r['id']).toSet();
        items.addAll(rows.where((r) => ids.add(r['id'])));
        offset += rows.length;
        more = result['hasMore'] == true;
      });
    } catch (_) {
      if (mounted && ticket == generation) {
        setState(
          () => error = 'Could not load updates. Pull to refresh or try again.',
        );
      }
    } finally {
      if (mounted && ticket == generation) setState(() => loading = false);
    }
  }

  Future<void> open(Map<String, dynamic> item) async {
    final type = item['mediaType'];
    final id = item['tmdbId'];
    if (!['movie', 'series'].contains(type) || id is! int || id < 1) return;
    try {
      await ref.read(nexApiClientProvider).acknowledgeNotifications([
        item['id'] as String,
      ], 'read');
      if (mounted) {
        setState(() => item['readAt'] = DateTime.now().toIso8601String());
      }
    } catch (_) {
      /* Reading a title must still work if acknowledging fails. */
    }
    if (mounted) context.push('/title/$type/$id');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Notifications')),
    body: RefreshIndicator(
      onRefresh: () => load(reset: true),
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 400 &&
              !loading &&
              more &&
              error == null) {
            load();
          }
          return false;
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Card(
              child: SwitchListTile(
                title: const Text('Phone popups'),
                subtitle: const Text(
                  'Local notifications when Nex opens or syncs. New releases cannot be checked while the app stays closed.',
                ),
                value: popups,
                onChanged: ref.watch(appControllerProvider).demoMode
                    ? null
                    : (value) async {
                        final enabled = value
                            ? await ReleaseNotificationService.instance.enable()
                            : false;
                        if (!value) {
                          await ReleaseNotificationService.instance.disable();
                        }
                        if (!mounted || !context.mounted) return;
                        setState(() => popups = enabled);
                        if (value && !enabled) {
                          showNexNotice(
                            context,
                            'Popups are unavailable or permission was denied. Updates still appear here.',
                          );
                        }
                        if (enabled) ReleaseNotificationService.instance.sync();
                      },
              ),
            ),
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'Movie releases you follow and new seasons of Seen series. Dates are checked daily and may change.',
              ),
            ),
            for (final item in items)
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 10,
                  ),
                  leading: Icon(
                    item['mediaType'] == 'series'
                        ? Icons.tv_outlined
                        : Icons.movie_outlined,
                    color: item['readAt'] == null
                        ? Theme.of(context).colorScheme.primary
                        : null,
                  ),
                  title: Text(
                    item['title'] as String,
                    style: TextStyle(
                      fontWeight: item['readAt'] == null
                          ? FontWeight.w700
                          : FontWeight.w500,
                    ),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      '${item['body']}\n${DateFormat.yMMMd().format(DateTime.parse(item['createdAt'] as String).toLocal())}',
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => open(item),
                ),
              ),
            if (loading)
              ...List.generate(
                items.isEmpty ? 6 : 2,
                (_) => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 6),
                  child: NexSkeleton(child: SkeletonBlock(height: 108)),
                ),
              ),
            if (!loading && items.isEmpty && error == null)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'No release updates yet. Follow a movie from its details, or enable New seasons in Settings.',
                  textAlign: TextAlign.center,
                ),
              ),
            if (error != null)
              Padding(padding: const EdgeInsets.all(16), child: Text(error!)),
            if (!loading && (more || error != null))
              TextButton(
                onPressed: load,
                child: Text(error == null ? 'Show more' : 'Retry'),
              ),
          ],
        ),
      ),
    ),
  );
}
