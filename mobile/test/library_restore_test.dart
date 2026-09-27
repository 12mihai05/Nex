import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/data/api_client.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/state/app_controller.dart';

class OfflineCatalogApi extends NexApiClient {
  @override
  Future<bool> hasStoredSession() async => true;
  @override
  Future<Map<String, dynamic>> settings() async => {
    'profile': {
      'appearance': 'system',
      'country': 'RO',
      'onboardingComplete': true,
      'remindersEnabled': true,
      'behaviorPersonalization': true,
    },
    'services': <Map<String, dynamic>>[],
    'languages': <Map<String, dynamic>>[],
  };
  @override
  Future<List<Map<String, dynamic>>> list(String path) async {
    if (path == '/api/me/history') {
      return List.generate(
        75,
        (i) => {
          'tmdbId': i + 1,
          'mediaType': 'movie',
          'titleSnapshot': 'Seen title ${i + 1}',
        },
      );
    }
    if (path == '/api/me/feedback') {
      return [
        {'tmdbId': 1, 'mediaType': 'movie', 'reaction': 'meh'},
        {'tmdbId': 80, 'mediaType': 'movie', 'reaction': 'like'},
      ];
    }
    return [];
  }

  @override
  Future<List<Map<String, dynamic>>> recommend() async => [];
  @override
  Future<ContentItem> title(String type, int id) async =>
      throw StateError('Catalog unavailable');
  @override
  Future<void> markWatched(ContentItem item) async =>
      throw StateError('Write unavailable');
  @override
  Future<void> removeWatched(ContentItem item) async =>
      throw StateError('Write unavailable');
  @override
  Future<void> react(ContentItem item, String reaction) async =>
      throw StateError('Write unavailable');
  @override
  Future<void> clearReaction(ContentItem item) async =>
      throw StateError('Write unavailable');
}

void main() {
  test('restores all 75 library snapshots and opinions despite metadata outage; failed edits retain state', () async {
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(OfflineCatalogApi())],
    );
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    expect(await controller.restoreSession(), isTrue);
    expect(controller.catalog.length, 75);
    expect(controller.browseHero, isNull);
    expect(controller.catalog.last.title, 'Seen title 75');
    expect(controller.catalog.every((i) => i.metadataOnly), isTrue);
    expect(container.read(appControllerProvider).reactions['movie:1'], 'meh');
    expect(
      container.read(appControllerProvider).watched.contains('movie:80'),
      isFalse,
    );
    final first = controller.catalog.first;
    await controller.react(first, 'dislike');
    expect(container.read(appControllerProvider).reactions[first.key], 'meh');
    await controller.react(first, null);
    expect(container.read(appControllerProvider).reactions[first.key], 'meh');
    await controller.removeWatched(first);
    expect(container.read(appControllerProvider).watched, contains(first.key));
    final unknown = ContentItem.fromJson({
      'id': 80,
      'mediaType': 'movie',
      'title': 'Unknown viewing status',
    });
    await controller.markWatched(unknown);
    expect(
      container.read(appControllerProvider).watched,
      isNot(contains(unknown.key)),
    );
    expect(container.read(appControllerProvider).error, isNotNull);
  });
}
