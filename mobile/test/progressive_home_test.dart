import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/models/discovery_rows.dart';
import 'package:nex/src/state/app_controller.dart';

import 'stable_discovery_test.dart' show MutableApi;

List<Map<String, dynamic>> batchRows(int batch) => [
  {
    'title': 'Batch $batch',
    'items': [
      for (var i = 0; i < 20; i++)
        {
          'item': {
            'id': 1000 + batch * 20 + i,
            'title': 'Title $batch $i',
            'mediaType': 'movie',
          },
          'reason': 'Test pick',
        },
    ],
  },
];

class ProgressiveApi extends MutableApi {
  final first = Completer<List<Map<String, dynamic>>>();
  bool failMore = true;
  final calls = <String>[];
  @override
  Future<List<Map<String, dynamic>>> list(String path) {
    if (path.startsWith('/api/discovery?batch=')) {
      calls.add(path);
      final batch = int.parse(path.split('=').last);
      if (batch == 0) return first.future;
      if (failMore) return Future.error(StateError('Offline'));
      return Future.value(batchRows(batch));
    }
    return super.list(path);
  }
}

class StartupApi extends MutableApi {
  final extras = Completer<List<Map<String, dynamic>>>();
  final flags = Completer<List<Map<String, dynamic>>>();
  final started = <String>[];
  @override
  Future<List<Map<String, dynamic>>> list(String path) {
    started.add(path);
    if (path == '/api/me/reminders' || path == '/api/me/taste') {
      return extras.future;
    }
    if (path == '/api/me/history') return flags.future;
    return super.list(path);
  }
}

void main() {
  test('discovery starts before flags complete; reminders and Taste cannot block Home', () async {
    final api = StartupApi();
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    await controller.restoreSession(background: true);
    await Future<void>.delayed(Duration.zero);
    expect(api.started, contains('/api/discovery?batch=0'));
    expect(container.read(appControllerProvider).busy, isTrue);
    api.flags.complete([
      {'tmdbId': 101, 'mediaType': 'movie', 'titleSnapshot': 'Title 101'},
    ]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(appControllerProvider).busy, isFalse);
    expect(
      controller.browseRows.expand((r) => r.items).any((i) => i.id == 101),
      isFalse,
    );
    expect(api.extras.isCompleted, isFalse);
    expect(api.started, isNot(contains('/api/tv/upcoming')));
    api.extras.completeError(StateError('Independent service failed'));
    await Future<void>.delayed(Duration.zero);
    expect(container.read(appControllerProvider).error, isNull);
  });
  test('startup returns after validation while first shelves are still pending; pagination retries and appends', () async {
    final api = ProgressiveApi();
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    expect(await controller.restoreSession(background: true), isTrue);
    expect(api.first.isCompleted, isFalse);
    expect(container.read(appControllerProvider).authenticated, isTrue);
    await Future<void>.delayed(Duration.zero);
    api.first.complete(batchRows(0));
    await Future<void>.delayed(Duration.zero);
    expect(controller.browseRows.first.title, 'Batch 0');
    await controller.loadMoreHome();
    expect(controller.homeBatchError, isNotNull);
    expect(controller.browseRows.length, 1);
    api.failMore = false;
    await controller.loadMoreHome();
    expect(controller.homeBatchError, isNull);
    expect(controller.browseRows.map((r) => r.title), ['Batch 0', 'Batch 1']);
    expect(api.calls.where((p) => p.endsWith('=1')).length, 2);
    for (var i = 0; i < 8; i++) {
      await controller.loadMoreHome();
    }
    expect(controller.hasMoreHome, isFalse);
    expect(controller.browseRows.length, 7);
  });
  test(
    'append preserves existing rows and suppresses repeated shelf contents',
    () {
      final initial = parseDiscoveryRows(batchRows(0));
      final repeated = parseDiscoveryRows([
        {...batchRows(0).first, 'title': 'Same titles, different heading'},
      ]);
      final result = appendDiscoveryRows(initial, [
        ...repeated,
        ...parseDiscoveryRows(batchRows(1)),
      ]);
      expect(result.length, 2);
      expect(identical(result.first, initial.first), isTrue);
    },
  );
}
