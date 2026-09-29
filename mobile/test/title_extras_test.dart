import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/data/demo_data.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/title_extras.dart';
import 'package:nex/src/widgets/skeleton.dart';

import 'stable_discovery_test.dart' show MutableApi;

class ExtrasApi extends MutableApi {
  final requests = <String>[];
  final details = Completer<Map<String, dynamic>>();
  final episodes = Completer<Map<String, dynamic>>();
  @override
  Future<Map<String, dynamic>> object(String path) {
    requests.add(path);
    return path.endsWith('/extras') ? details.future : episodes.future;
  }
}

void main() {
  testWidgets(
    'compact trailer state is button-sized and safely handles missing trailers',
    (tester) async {
      final api = ExtrasApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      await c.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp(
            home: Scaffold(
              body: TitleExtras(item: demoCatalog.first, trailerOnly: true),
            ),
          ),
        ),
      );
      expect(find.byType(SkeletonBlock), findsOneWidget);
      api.details.complete({
        'videos': [],
        'seasons': [
          {'number': 1, 'name': 'Season 1', 'episodeCount': 5},
        ],
      });
      await tester.pumpAndSettle();
      expect(find.text('No trailer available'), findsOneWidget);
      expect(
        tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull,
      );
      expect(find.byType(DropdownButtonFormField<int>), findsNothing);
    },
  );
  testWidgets(
    'trailers and seasons load separately; episode selection is lazy and cached',
    (tester) async {
      final api = ExtrasApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      await container.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: TitleExtras(item: demoCatalog.first),
              ),
            ),
          ),
        ),
      );
      expect(find.byType(NexSkeleton), findsOneWidget);
      expect(api.requests.length, 1);
      api.details.complete({
        'videos': [
          {
            'name': 'Official trailer',
            'type': 'Trailer',
            'official': true,
            'url': 'https://www.youtube.com/watch?v=abcdefghijk',
          },
        ],
        'seasons': [
          {'number': 1, 'name': 'Season 1', 'episodeCount': 2},
        ],
      });
      await tester.pumpAndSettle();
      expect(find.text('Official trailer'), findsOneWidget);
      expect(find.text('1 season'), findsOneWidget);
      expect(api.requests.length, 1);
      await tester.tap(find.byType(DropdownButtonFormField<int>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Season 1 · 2 episodes').last);
      await tester.pump();
      expect(api.requests.last, contains('/seasons/1'));
      expect(find.byType(NexSkeleton), findsOneWidget);
      api.episodes.complete({
        'videos': [],
        'episodes': [
          {
            'number': 1,
            'name': 'Pilot',
            'runtimeMinutes': 42,
            'rating': 8.3,
            'airDate': '2020-01-01',
          },
          {
            'number': 2,
            'name': 'Unknown runtime',
            'runtimeMinutes': null,
            'rating': null,
            'airDate': null,
          },
        ],
      });
      await tester.pumpAndSettle();
      expect(find.text('Pilot'), findsOneWidget);
      expect(find.textContaining('42 min · 8.3/10'), findsOneWidget);
      expect(find.textContaining('null'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
