import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/screens/upcoming_movies.dart';
import 'package:nex/src/screens/browse_screen.dart';
import 'package:nex/src/widgets/programme_sheet.dart';
import 'package:nex/src/widgets/reminder_sheet.dart';
import 'package:nex/src/widgets/release_details.dart';
import 'package:nex/src/widgets/content_card.dart';
import 'package:nex/src/widgets/skeleton.dart';
import 'package:nex/src/data/demo_data.dart';
import 'package:nex/src/models/tv_program.dart';

import 'stable_discovery_test.dart' show MutableApi;

class ReleaseApi extends MutableApi {
  bool followed = false;
  @override
  Future<void> setReleaseFollow(item, String kind, bool enabled) async {
    followed = enabled;
  }

  final pending = Completer<Map<String, dynamic>>();
  final pages = <int>[];
  @override
  Future<Map<String, dynamic>> object(String path) async {
    if (path.contains('/programmes/')) {
      return {
        'description': 'Programme plot',
        'cast': ['Actor One'],
        'castScope': 'series',
      };
    }
    if (path.endsWith('/releases')) {
      return {
        'country': 'RO',
        'day': '2026-10-10',
        'releases': [
          {'kind': 'cinema', 'date': '2026-12-18'},
        ],
        'subscriptions': [],
      };
    }
    return super.object(path);
  }

  @override
  Future<Map<String, dynamic>> upcoming(int page) {
    pages.add(page);
    return pending.future;
  }
}

Future<ProviderContainer> viewer(ReleaseApi api) async {
  final c = ProviderContainer(
    overrides: [nexApiClientProvider.overrideWithValue(api)],
  );
  await c.read(appControllerProvider.notifier).restoreSession();
  return c;
}

void main() {
  testWidgets(
    'Upcoming is inside Filters, not another Home chip, and preserves Movies selection',
    (tester) async {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      c.read(appControllerProvider.notifier).enterDemo();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: const MaterialApp(home: BrowseScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Upcoming'), findsNothing);
      await tester.tap(find.text('Movies'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Filters'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Upcoming in cinemas'));
      await tester.pumpAndSettle();
      expect(find.byType(UpcomingMovies), findsOneWidget);
      await tester.tap(find.text('Back to streaming'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Movies'))
            .selected,
        isTrue,
      );
    },
  );
  testWidgets(
    'empty provider page with more pages does not claim country has no upcoming films',
    (tester) async {
      final api = ReleaseApi();
      final c = await viewer(api);
      addTearDown(c.dispose);
      api.pending.complete({
        'data': [],
        'meta': {'hasMore': true, 'day': '2026-10-10'},
      });
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: const MaterialApp(home: Scaffold(body: UpcomingMovies())),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('No upcoming cinema dates listed'),
        findsNothing,
      );
      expect(find.textContaining('More results are available'), findsOneWidget);
      expect(find.text('Show more'), findsOneWidget);
      await tester.tap(find.text('Show more'));
      await tester.pumpAndSettle();
      expect(api.pages, [1, 2]);
    },
  );
  testWidgets('long programme synopsis never hides the reminder action', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ReleaseApi();
    final c = await viewer(api);
    addTearDown(c.dispose);
    final p = TvProgram(
      id: 'long',
      title: 'Upcoming programme',
      channel: 'Channel',
      startsAt: DateTime.now().add(const Duration(hours: 2)),
      endsAt: DateTime.now().add(const Duration(hours: 3)),
      description: List.filled(60, 'A long programme description.').join(' '),
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          home: Scaffold(
            body: Align(
              alignment: Alignment.bottomCenter,
              child: ProgrammeSheet(program: p),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Remind me').hitTestable(), findsOneWidget);
    await tester.tap(find.text('Remind me'));
    await tester.pumpAndSettle();
    expect(find.byType(ReminderSheet), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'already started programme explains why no new reminder is available',
    (tester) async {
      final api = ReleaseApi();
      final c = await viewer(api);
      addTearDown(c.dispose);
      final p = TvProgram(
        id: 'live',
        title: 'Live programme',
        channel: 'Channel',
        startsAt: DateTime.now().subtract(const Duration(minutes: 5)),
        endsAt: DateTime.now().add(const Duration(hours: 1)),
      );
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp(
            home: Scaffold(body: ProgrammeSheet(program: p)),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Already on air'), findsOneWidget);
      expect(find.text('Remind me'), findsNothing);
    },
  );
  testWidgets(
    'upcoming uses full-height placeholders then regional dates without providers',
    (tester) async {
      final api = ReleaseApi();
      final c = await viewer(api);
      addTearDown(c.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: const MaterialApp(home: Scaffold(body: UpcomingMovies())),
        ),
      );
      expect(find.byType(PosterSkeletons), findsOneWidget);
      api.pending.complete({
        'data': [
          {
            'id': 42,
            'mediaType': 'movie',
            'title': 'Unreleased movie',
            'releaseDate': '2026-12-18',
            'releaseCountry': 'RO',
            'metadataOnly': true,
          },
        ],
        'meta': {'hasMore': false, 'day': '2026-10-10'},
      });
      await tester.pumpAndSettle();
      expect(find.byType(ContentCard), findsOneWidget);
      expect(find.textContaining('Dec 18, 2026'), findsOneWidget);
      expect(api.pages, [1]);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'programme details first, reminder subview returns exact custom offset',
    (tester) async {
      final api = ReleaseApi();
      final c = await viewer(api);
      addTearDown(c.dispose);
      final p = TvProgram(
        id: 'p',
        title: 'A programme',
        channel: 'Channel',
        startsAt: DateTime.now().add(const Duration(hours: 3)),
        endsAt: DateTime.now().add(const Duration(hours: 4)),
      );
      int? result;
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () async {
                    result = await showModalBottomSheet<int>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => ProgrammeSheet(program: p),
                    );
                  },
                  child: const Text('Open'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('Programme plot'), findsOneWidget);
      expect(find.text('Series cast'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      await tester.tap(find.text('Remind me'));
      await tester.pumpAndSettle();
      expect(find.byType(ReminderSheet), findsOneWidget);
      await tester.tap(find.text('Programme details'));
      await tester.pumpAndSettle();
      expect(find.text('Programme plot'), findsOneWidget);
      await tester.tap(find.text('Remind me'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '17');
      await tester.ensureVisible(find.text('Set reminder'));
      await tester.tap(find.text('Set reminder'));
      await tester.pumpAndSettle();
      expect(result, 17);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'release follow saves inbox subscription even without local popup support',
    (tester) async {
      final api = ReleaseApi();
      final c = await viewer(api);
      addTearDown(c.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: ReleaseDetails(item: demoCatalog.first),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Dec 18, 2026'), findsOneWidget);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Cinema'));
      await tester.pump();
      expect(api.followed, isTrue);
      expect(find.textContaining('Phone popups are off'), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
    },
  );
}
