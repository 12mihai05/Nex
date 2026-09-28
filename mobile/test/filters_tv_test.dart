import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/widgets/catalog_filter_sheet.dart';
import 'package:nex/src/screens/tv_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'library_restore_test.dart' show OfflineCatalogApi;

class ChannelApi extends OfflineCatalogApi {
  int schedules = 0;
  final queries = <String>[];
  final save = Completer<void>();
  @override
  Future<Map<String, dynamic>> tvDiscover() async {
    schedules++;
    return {'live': [], 'upcoming': []};
  }

  @override
  Future<List<Map<String, dynamic>>> list(String path) async {
    if (!path.startsWith('/api/tv/channels')) return super.list(path);
    queries.add(path);
    return [
      {
        'id': 'ro:test',
        'name': 'Test channel',
        'favorite': false,
        'available': true,
      },
    ];
  }

  @override
  Future<void> setChannelFavorite(String id, bool favorite) => save.future;
}

class BusyTvApi extends ChannelApi {
  @override
  Future<Map<String, dynamic>> tvDiscover() async => {
    'live': List.generate(
      32,
      (i) => {
        'id': 'p$i',
        'title': 'Programme $i',
        'channel': {'id': 'c$i', 'name': 'Channel $i'},
        'favorite': i < 30,
        'startAt': DateTime.now()
            .subtract(const Duration(minutes: 20))
            .toUtc()
            .toIso8601String(),
        'endAt': DateTime.now()
            .add(const Duration(minutes: 40))
            .toUtc()
            .toIso8601String(),
      },
    ),
    'upcoming': [],
  };
}

void main() {
  testWidgets(
    'TV shelves keep thirty favorites and other channels, with a full-list escape hatch',
    (tester) async {
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(BusyTvApi())],
      );
      addTearDown(c.dispose);
      await c.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: const MaterialApp(home: TvScreen()),
        ),
      );
      await tester.pumpAndSettle();
      final shelf = tester.widget<ListView>(
        find
            .byWidgetPredicate(
              (w) => w is ListView && w.scrollDirection == Axis.horizontal,
            )
            .first,
      );
      expect(
        (shelf.childrenDelegate as SliverChildBuilderDelegate)
            .estimatedChildCount,
        63,
      );
      expect(find.text('See all'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'guide retains input and favorites update before save, then roll back on failure',
    (tester) async {
      final api = ChannelApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      await container.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: NexTheme.light,
            home: const TvScreen(initialGuide: true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final before = api.schedules;
      await tester.enterText(
        find.byKey(const ValueKey('channel-search')),
        'Test',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Test',
      );
      expect(api.schedules, before);
      await tester.tap(find.byTooltip('Favorite channel'));
      await tester.pump();
      expect(find.byTooltip('Unfavorite channel'), findsOneWidget);
      expect(api.schedules, before);
      api.save.completeError(Exception('offline'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Favorite channel'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Test',
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'duration accepts exact minutes and shows validation for reversed bounds',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: NexTheme.light,
          home: Scaffold(body: CatalogFilterSheet(type: 'movie')),
        ),
      );
      await tester.enterText(find.widgetWithText(TextField, 'Minimum'), '91');
      await tester.enterText(find.widgetWithText(TextField, 'Maximum'), '70');
      await tester.tap(find.text('Show titles'));
      await tester.pump();
      expect(
        find.text('Use 1–1440 minutes, with minimum no greater than maximum.'),
        findsOneWidget,
      );
    },
  );
  test('system bars contrast with the selected appearance', () {
    expect(
      NexTheme.light.appBarTheme.systemOverlayStyle!.statusBarIconBrightness,
      Brightness.dark,
    );
    expect(
      NexTheme.dark.appBarTheme.systemOverlayStyle!.statusBarIconBrightness,
      Brightness.light,
    );
    expect(
      NexTheme.light.colorScheme.surface.computeLuminance(),
      lessThan(.85),
    );
  });
}
