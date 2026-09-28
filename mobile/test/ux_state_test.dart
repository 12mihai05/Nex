import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/models/content.dart';

import 'library_restore_test.dart';

class DelayedApi extends OfflineCatalogApi {
  final countries = <String, Completer<List<Map<String, dynamic>>>>{};
  final searches = <String, Completer<List<ContentItem>>>{};
  int saves = 0;
  @override
  Future<void> saveSettings(Map<String, dynamic> data) async {
    saves++;
  }

  @override
  Future<List<Map<String, dynamic>>> list(String path) {
    if (path.startsWith('/api/providers?')) {
      return (countries[path.split('=').last] ??= Completer()).future;
    }
    return super.list(path);
  }

  @override
  Future<List<ContentItem>> search(String query) =>
      (searches[query] ??= Completer()).future;
}

void main() {
  test('country selection is immediate, avoids writes, ignores obsolete provider replies', () async {
    final api = DelayedApi();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    final controller = c.read(appControllerProvider.notifier);
    await controller.restoreSession();
    final first = controller.updateOnboardingCountry('FR');
    expect(c.read(appControllerProvider).country, 'FR');
    final second = controller.updateOnboardingCountry('GB');
    expect(c.read(appControllerProvider).country, 'GB');
    expect(api.saves, 0);
    api.countries['GB']!.complete([
      {'id': 8, 'name': 'British service'},
    ]);
    await second;
    api.countries['FR']!.complete([
      {'id': 9, 'name': 'French service'},
    ]);
    await first;
    expect(c.read(appControllerProvider).country, 'GB');
    expect(controller.availableServices, {8: 'British service'});
    await controller.updateOnboardingCountry('FR');
    expect(controller.availableServices, {9: 'French service'});
  });
  test(
    'old search replies cannot overwrite the latest query or cleared results',
    () async {
      final api = DelayedApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      final controller = c.read(appControllerProvider.notifier);
      await controller.restoreSession();
      final first = controller.search('old');
      final second = controller.search('new');
      api.searches['new']!.complete([
        ContentItem.fromJson({'id': 2, 'mediaType': 'movie', 'title': 'New'}),
      ]);
      await second;
      api.searches['old']!.complete([
        ContentItem.fromJson({'id': 1, 'mediaType': 'movie', 'title': 'Old'}),
      ]);
      await first;
      expect(c.read(appControllerProvider).searchResults.single.title, 'New');
      final third = controller.search('pending');
      await controller.search('');
      api.searches['pending']!.complete([]);
      await third;
      expect(c.read(appControllerProvider).searchResults, isEmpty);
    },
  );
}
