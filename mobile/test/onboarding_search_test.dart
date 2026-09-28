import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/onboarding_favorites.dart';
import 'package:nex/src/widgets/skeleton.dart';

import 'library_restore_test.dart' show OfflineCatalogApi;

class FavoritesApi extends OfflineCatalogApi {
  final searches = <String, Completer<List<ContentItem>>>{};
  Map<String, dynamic>? submitted;
  @override
  Future<List<ContentItem>> searchOnboarding(String query) =>
      (searches[query] = Completer<List<ContentItem>>()).future;
  @override
  Future<void> saveSettings(Map<String, dynamic> data) async {}
  @override
  Future<Map<String, dynamic>> analyzeTaste(Map<String, dynamic> data) async {
    submitted = data;
    return {};
  }
}

ContentItem title(int id, String type, String name) =>
    ContentItem.fromJson({'id': id, 'mediaType': type, 'title': name});
void main() {
  testWidgets(
    'onboarding searches actual titles, ignores stale replies and retains selections',
    (tester) async {
      final api = FavoritesApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      await c.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: const MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(child: OnboardingFavorites()),
            ),
          ),
        ),
      );
      await tester.enterText(find.byType(TextField), 'Old');
      await tester.pump(const Duration(milliseconds: 310));
      expect(find.byType(PosterSkeletons), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'New');
      await tester.pump(const Duration(milliseconds: 310));
      api.searches['New']!.complete([title(600001, 'movie', 'New favorite')]);
      await tester.pumpAndSettle();
      await tester.tap(find.text('New favorite'));
      await tester.pump();
      api.searches['Old']!.complete([title(600002, 'movie', 'Old result')]);
      await tester.pumpAndSettle();
      expect(find.text('Old result'), findsNothing);
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(find.text('1 of 5 selected'), findsOneWidget);
      expect(
        c.read(appControllerProvider).onboardingFavorites.single.key,
        'movie:600001',
      );
    },
  );
  test('favorite payload supports real IDs, movie/series collisions and a five-title cap', () async {
    final api = FavoritesApi();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    final controller = c.read(appControllerProvider.notifier);
    await controller.restoreSession();
    controller.toggleOnboardingFavorite(title(600001, 'movie', 'A movie'));
    controller.toggleOnboardingFavorite(title(600001, 'series', 'A series'));
    for (var i = 2; i < 7; i++) {
      controller.toggleOnboardingFavorite(
        title(600000 + i, 'movie', 'Film $i'),
      );
    }
    expect(c.read(appControllerProvider).onboardingFavorites.length, 5);
    await controller.finishOnboarding();
    final favorites = api.submitted!['favorites'] as List;
    expect(favorites.length, 5);
    expect(
      favorites.map((i) => '${i['mediaType']}:${i['id']}'),
      containsAll(['movie:600001', 'series:600001']),
    );
  });
}
