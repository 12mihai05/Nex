import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/screens/upcoming_movies.dart';
import 'package:nex/src/widgets/programme_sheet.dart';
import 'package:nex/src/widgets/reminder_sheet.dart';
import 'package:nex/src/widgets/release_details.dart';
import 'package:nex/src/widgets/content_card.dart';
import 'package:nex/src/widgets/skeleton.dart';
import 'package:nex/src/data/demo_data.dart';
import 'package:nex/src/models/tv_program.dart';

import 'stable_discovery_test.dart' show MutableApi;

class ReleaseApi extends MutableApi {
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
    'release details show date and cannot pretend unconfigured push is enabled',
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
      await tester.tap(find.text('Notify me · cinema release'));
      await tester.pump();
      expect(find.textContaining('not configured yet'), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
    },
  );
}
