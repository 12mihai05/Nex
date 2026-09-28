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

void main() {
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
    expect(controller.browseRows.length, 6);
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
