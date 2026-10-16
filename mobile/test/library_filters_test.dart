import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/screens/library_screen.dart';
import 'package:nex/src/widgets/catalog_filter_sheet.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/content_card.dart';

import 'library_restore_test.dart' show OfflineCatalogApi;

ContentItem title(int id, {String mediaType = 'movie', int? runtime = 100}) =>
    ContentItem.fromJson({
      'id': id,
      'mediaType': mediaType,
      'title': 'Saved title $id',
      'genres': ['Drama'],
      'runtimeMinutes': runtime,
      'availability': [
        {'providerId': 8, 'providerName': 'Netflix', 'access': 'included'},
      ],
    });

class LibraryApi extends OfflineCatalogApi {
  final requests = <int>[];
  int active = 0, maxActive = 0;
  @override
  Future<List<Map<String, dynamic>>> list(String path) async {
    if (path == '/api/me/history' || path == '/api/me/watchlist') {
      return List.generate(
        36,
        (i) => {
          'tmdbId': i + 1,
          'mediaType': 'movie',
          'titleSnapshot': 'Saved title ${i + 1}',
        },
      );
    }
    return [];
  }

  @override
  Future<ContentItem> title(String type, int id) async {
    requests.add(id);
    active++;
    if (active > maxActive) maxActive = active;
    await Future<void>.value();
    active--;
    return ContentItem.fromJson({
      'id': id,
      'mediaType': type,
      'title': 'Saved title $id',
      'genres': ['Drama'],
      'runtimeMinutes': 60 + id,
      'posterUrl': 'https://image.tmdb.org/t/p/w342/test-$id.jpg',
    });
  }
}

void main() {
  testWidgets('Seen artwork hydration is retained on re-entry', (tester) async {
    final api = LibraryApi();
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    await container.read(appControllerProvider.notifier).restoreSession();
    Widget screen() => UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: LibraryScreen(watched: true)),
    );
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    expect(api.requests.where((id) => id == 1).length, 1);
    expect(
      container
          .read(appControllerProvider.notifier)
          .catalog
          .firstWhere((i) => i.id == 1)
          .posterUrl,
      isNotNull,
    );
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    expect(api.requests.where((id) => id == 1).length, 1);
  });
  test('library filters combine type, genre, runtime, title and included services without guessing unknowns', () {
    final movie = title(1);
    expect(
      libraryMatches(
        movie,
        type: 'movie',
        genre: 'Drama',
        minimum: 90,
        maximum: 110,
        providers: {8},
        query: 'saved',
      ),
      isTrue,
    );
    expect(libraryMatches(movie, providers: {119}), isFalse);
    expect(libraryMatches(movie, genre: 'Horror'), isFalse);
    expect(libraryMatches(title(1, mediaType: 'series'), minimum: 90), isFalse);
    expect(libraryMatches(title(1, runtime: null), minimum: 90), isFalse);
    expect(libraryMatches(movie, type: 'series'), isFalse);
  });
  testWidgets(
    'library service filtering is explicit and omits Home viewing and Upcoming controls',
    (tester) async {
      CatalogFilters? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () async {
                  result = await showModalBottomSheet<CatalogFilters>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => const CatalogFilterSheet(
                      type: 'movie',
                      libraryMode: true,
                      services: {8: 'Netflix', 119: 'Prime'},
                    ),
                  );
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('New to me'), findsNothing);
      expect(find.text('Upcoming in cinemas'), findsNothing);
      await tester.ensureVisible(find.text('On my streaming services'));
      await tester.tap(find.text('On my streaming services'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Show titles'));
      await tester.tap(find.text('Show titles'));
      await tester.pumpAndSettle();
      expect(result?.providers, {8, 119});
    },
  );
  for (final watched in [false, true]) {
    testWidgets(
      '${watched ? 'Seen' : 'Want to see'} filters check beyond first batch and preserve flags',
      (tester) async {
        final api = LibraryApi();
        final c = ProviderContainer(
          overrides: [nexApiClientProvider.overrideWithValue(api)],
        );
        addTearDown(c.dispose);
        await c.read(appControllerProvider.notifier).restoreSession();
        api.requests.clear();
        api.maxActive = 0;
        final beforeSeen = Set.of(c.read(appControllerProvider).watched),
            beforeSaved = Set.of(c.read(appControllerProvider).watchlist);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: c,
            child: MaterialApp(home: LibraryScreen(watched: watched)),
          ),
        );
        await tester.pumpAndSettle();
        expect(api.requests.length, 12);
        expect(
          tester
              .widgetList<ContentCard>(find.byType(ContentCard))
              .any((card) => card.item.posterUrl != null),
          isTrue,
        );
        expect(find.byTooltip('Find a title to add'), findsNothing);
        await tester.tap(find.text('Filters'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byWidgetPredicate(
            (w) => w is TextField && w.decoration?.labelText == 'Minimum',
          ),
          '90',
        );
        await tester.ensureVisible(find.text('Show titles'));
        await tester.tap(find.text('Show titles'));
        await tester.pumpAndSettle();
        expect(
          api.requests.length,
          24,
        ); // 12 artwork repairs, then 12 filtered titles.
        expect(
          find.textContaining('more saved titles to check'),
          findsOneWidget,
        );
        for (var i = 0; i < 3 && api.requests.length < 36; i++) {
          await tester.ensureVisible(find.text('Check more saved titles'));
          await tester.tap(find.text('Check more saved titles'));
          await tester.pumpAndSettle();
        }
        expect(api.requests.toSet().length, 36);
        expect(api.maxActive, lessThanOrEqualTo(4));
        expect(c.read(appControllerProvider).watched, beforeSeen);
        expect(c.read(appControllerProvider).watchlist, beforeSaved);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
