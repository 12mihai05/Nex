import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/screens/browse_screen.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/content_row.dart';
import 'package:nex/src/widgets/skeleton.dart';

import 'stable_discovery_test.dart' show MutableApi;

class ShelvesApi extends MutableApi {
  final requests = <String, Completer<List<Map<String, dynamic>>>>{};
  @override
  Future<List<Map<String, dynamic>>> list(String path) {
    if (path.startsWith('/api/discovery?')) {
      return (requests[path] = Completer()).future;
    }
    return super.list(path);
  }
}

List<Map<String, dynamic>> shelves(String type) => [
  for (final row in ['Personal picks', 'Highly rated'])
    {
      'title': row,
      'items': [
        for (var i = 1; i <= 3; i++)
          {
            'item': {
              'id': i + 100,
              'title': '$type $i',
              'mediaType': type,
              'runtimeMinutes': 80,
            },
          },
      ],
    },
];

void main() {
  testWidgets(
    'home filters retain shelves, duration is visible and type snapshots are reused',
    (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ShelvesApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      await c.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: const MaterialApp(home: BrowseScreen()),
        ),
      );
      await tester.tap(find.text('Filters'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Minimum'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Maximum'), findsOneWidget);
      Navigator.of(tester.element(find.text('Show titles'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Movies'));
      await tester.pump();
      expect(find.byType(HomeSkeleton), findsOneWidget);
      api.requests.values.single.complete(shelves('movie'));
      await tester.pumpAndSettle();
      expect(find.byType(ContentShelf), findsWidgets);
      expect(find.byType(GridView), findsNothing);
      await tester.tap(find.text('Series'));
      await tester.pump();
      api.requests.values.last.complete(shelves('series'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Movies'));
      await tester.pumpAndSettle();
      expect(api.requests.length, 2);
      expect(find.byType(HomeSkeleton), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'poster skeleton geometry matches the results grid and fills tall viewports',
    (tester) async {
      tester.view.physicalSize = const Size(430, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: PosterSkeletons())),
      );
      final grid = tester.widget<GridView>(find.byType(GridView));
      final delegate =
          grid.gridDelegate as SliverGridDelegateWithMaxCrossAxisExtent;
      expect(delegate.maxCrossAxisExtent, 180);
      expect(delegate.childAspectRatio, .49);
      expect(delegate.crossAxisSpacing, 14);
      expect(delegate.mainAxisSpacing, 18);
      expect(
        (grid.childrenDelegate as SliverChildBuilderDelegate).childCount!,
        greaterThan(6),
      );
      expect(find.byType(PosterCardSkeleton), findsWidgets);
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: ChannelListSkeleton()),
          ),
        ),
      );
      expect(find.byType(ListTile).evaluate().length, greaterThan(12));
      expect(
        tester.getBottomRight(find.byType(ListTile).last).dy,
        greaterThanOrEqualTo(1200),
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
