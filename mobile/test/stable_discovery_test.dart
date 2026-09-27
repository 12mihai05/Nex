import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/models/chat_message.dart';

import 'library_restore_test.dart' show OfflineCatalogApi;

class MutableApi extends OfflineCatalogApi {
  int recommendations = 0;
  bool fail = false;
  bool failPersonalRead = false;
  final saved = <int>{};
  final seen = <int>{};
  final opinions = <int, String>{};
  @override
  Future<List<Map<String, dynamic>>> recommend() async {
    recommendations++;
    return [
      for (final id in [101, 102, 103])
        {
          'item': {'id': id, 'mediaType': 'movie', 'title': 'Title $id'},
          'reason': 'A test pick.',
        },
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> list(String path) async {
    if (failPersonalRead) throw StateError('Read unavailable');
    if (path == '/api/me/watchlist') {
      return [
        for (final id in saved)
          {'tmdbId': id, 'mediaType': 'movie', 'titleSnapshot': 'Title $id'},
      ];
    }
    if (path == '/api/me/history') {
      return [
        for (final id in seen)
          {'tmdbId': id, 'mediaType': 'movie', 'titleSnapshot': 'Title $id'},
      ];
    }
    if (path == '/api/me/feedback') {
      return [
        for (final e in opinions.entries)
          {'tmdbId': e.key, 'mediaType': 'movie', 'reaction': e.value},
      ];
    }
    if (path == '/api/me/taste') {
      return opinions.isEmpty
          ? []
          : [
              {
                'dimension': 'keyword',
                'key': 'underdog',
                'score': .8,
                'confidence': .8,
              },
            ];
    }
    return [];
  }

  @override
  Future<void> saveWatchlist(ContentItem item) async {
    await Future<void>.delayed(Duration.zero);
    if (fail) throw StateError('Unavailable');
    saved.add(item.id);
  }

  @override
  Future<void> removeWatchlist(ContentItem item) async {
    if (fail) throw StateError('Unavailable');
    saved.remove(item.id);
  }

  @override
  Future<void> react(ContentItem item, String reaction) async {
    opinions[item.id] = reaction;
  }

  @override
  Future<void> clearReaction(ContentItem item) async {
    opinions.remove(item.id);
  }

  @override
  Future<void> markWatched(ContentItem item) async {
    seen.add(item.id);
  }

  @override
  Future<Map<String, dynamic>> chat(String message, {String? sessionId}) async {
    failPersonalRead = true;
    return {
      'sessionId': 'test-session',
      'blocks': [
        {'type': 'confirmation', 'content': 'Added to your Want to see list.'},
      ],
    };
  }
}

void main() {
  test('a failed library read cannot erase a successful Chat action', () async {
    final api = MutableApi();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    final controller = c.read(appControllerProvider.notifier);
    await controller.restoreSession();
    await controller.sendChat('I want to see the first one');
    final blocks = c.read(appControllerProvider).chatMessages.last.blocks;
    expect(blocks.whereType<ConfirmationChatBlock>(), hasLength(1));
    expect(
      blocks.whereType<TextChatBlock>().any(
        (b) => b.text.contains('Your change was saved'),
      ),
      isTrue,
    );
    expect(c.read(appControllerProvider).busy, isFalse);
  });
  test('flags update immediately without reranking; refresh uses new state and stats', () async {
    final api = MutableApi();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    final controller = c.read(appControllerProvider.notifier);
    await controller.restoreSession();
    final items = controller.catalog.toList();
    expect(api.recommendations, 1);
    await controller.refreshIfStale();
    expect(api.recommendations, 1);
    await Future.wait([
      controller.toggleWatchlist(items[0]),
      controller.toggleWatchlist(items[1]),
    ]);
    expect(c.read(appControllerProvider).watchlist.length, 2);
    expect(api.recommendations, 1);
    expect(controller.browseHero?.id, 101);
    await controller.react(items[0], 'dislike');
    expect(controller.tasteLikes, contains('underdog'));
    expect(controller.browseHero?.id, 102);
    expect(api.recommendations, 1);
    await controller.markWatched(items[1]);
    expect(controller.browseHero?.id, 103);
    expect(controller.recommendationsPending, isTrue);
    await controller.refreshLive();
    expect(api.recommendations, 2);
    expect(controller.recommendationsPending, isFalse);
    api.fail = true;
    await controller.toggleWatchlist(items[0]);
    expect(c.read(appControllerProvider).watchlist, contains(items[0].key));
  });
  test('confirmation state restores saved titles without replacing the Browse snapshot', () async {
    final api = MutableApi();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    final controller = c.read(appControllerProvider.notifier);
    await controller.restoreSession();
    api.saved.add(999);
    api.seen.add(101);
    api.opinions[102] = 'meh';
    await controller.refreshPersonalState();
    expect(controller.catalog.any((i) => i.id == 999), isTrue);
    expect(c.read(appControllerProvider).watchlist, contains('movie:999'));
    expect(controller.browseHero?.id, 103);
    expect(api.recommendations, 1);
  });
}
