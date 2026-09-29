import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/state/app_controller.dart';

import 'stable_discovery_test.dart' show MutableApi;

class SlowWrites extends MutableApi {
  final writes = <(String, Completer<void>)>[];
  final taste = Completer<List<Map<String, dynamic>>>();
  bool slowTaste = false;
  Future<void> write(String label) {
    final pending = Completer<void>();
    writes.add((label, pending));
    return pending.future;
  }

  @override
  Future<void> saveWatchlist(ContentItem item) => write('want');
  @override
  Future<void> removeWatchlist(ContentItem item) => write('unwant');
  @override
  Future<void> markWatched(ContentItem item) => write('seen');
  @override
  Future<void> react(ContentItem item, String reaction) => write(reaction);
  @override
  Future<List<Map<String, dynamic>>> list(String path) =>
      slowTaste && path == '/api/me/taste' ? taste.future : super.list(path);
}

void main() {
  test(
    'flags update before the network and saves do not wait for taste refresh',
    () async {
      final api = SlowWrites();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      final controller = c.read(appControllerProvider.notifier);
      await controller.restoreSession();
      final item = controller.catalog.first;
      api.slowTaste = true;
      final want = controller.toggleWatchlist(item);
      final seen = controller.markWatched(item);
      final like = controller.react(item, 'like');
      expect(c.read(appControllerProvider).watchlist, contains(item.key));
      expect(c.read(appControllerProvider).watched, contains(item.key));
      expect(c.read(appControllerProvider).reactions[item.key], 'like');
      await Future<void>.delayed(Duration.zero);
      expect(api.writes.length, 3);
      for (final write in api.writes) {
        write.$2.complete();
      }
      await Future.wait([want, seen, like]);
      expect(api.taste.isCompleted, isFalse);
      api.taste.complete([]);
      await Future<void>.delayed(Duration.zero);
    },
  );
  test('rapid changes serialize and a failed last change restores the last confirmed opinion', () async {
    final api = SlowWrites();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    final controller = c.read(appControllerProvider.notifier);
    await controller.restoreSession();
    final item = controller.catalog.first;
    final like = controller.react(item, 'like');
    final dislike = controller.react(item, 'dislike');
    expect(c.read(appControllerProvider).reactions[item.key], 'dislike');
    await Future<void>.delayed(Duration.zero);
    expect(api.writes.map((w) => w.$1), ['like']);
    api.writes.first.$2.complete();
    await like;
    await Future<void>.delayed(Duration.zero);
    expect(c.read(appControllerProvider).reactions[item.key], 'dislike');
    expect(api.writes.last.$1, 'dislike');
    api.writes.last.$2.completeError(StateError('Save failed'));
    await dislike;
    expect(c.read(appControllerProvider).reactions[item.key], 'like');
    expect(c.read(appControllerProvider).error, isNotNull);
  });
  test('failure rolls back only the affected title and flag', () async {
    final api = SlowWrites();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    final controller = c.read(appControllerProvider.notifier);
    await controller.restoreSession();
    final a = controller.catalog.first, b = controller.catalog.last;
    final first = controller.toggleWatchlist(a),
        second = controller.toggleWatchlist(b);
    await Future<void>.delayed(Duration.zero);
    api.writes[0].$2.completeError(StateError('Offline'));
    api.writes[1].$2.complete();
    await Future.wait([first, second]);
    expect(c.read(appControllerProvider).watchlist, isNot(contains(a.key)));
    expect(c.read(appControllerProvider).watchlist, contains(b.key));
  });
}
