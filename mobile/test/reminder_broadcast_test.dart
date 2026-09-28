import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nex/src/data/demo_data.dart';
import 'package:nex/src/state/app_controller.dart';

import 'stable_discovery_test.dart' show MutableApi;

import 'package:nex/src/models/tv_program.dart';
import 'package:nex/src/widgets/reminder_sheet.dart';
import 'package:nex/src/widgets/title_broadcasts.dart';

class BroadcastApi extends MutableApi {
  bool failBroadcast = true;
  @override
  Future<List<Map<String, dynamic>>> list(String path) async {
    if (path.endsWith('/broadcasts')) {
      if (failBroadcast) throw StateError('Unavailable');
      return [
        {
          'id': 'airing',
          'title': 'Localized title',
          'channel': {'id': 'not-favorite', 'name': 'Antena 1'},
          'startAt': DateTime.now()
              .subtract(const Duration(minutes: 10))
              .toIso8601String(),
          'endAt': DateTime.now()
              .add(const Duration(hours: 1))
              .toIso8601String(),
        },
      ];
    }
    return super.list(path);
  }
}

void main() {
  testWidgets(
    'title broadcast failures are retryable, live non-favorites are plain information',
    (tester) async {
      final api = BroadcastApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      await container.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: Scaffold(body: TitleBroadcasts(item: demoCatalog.first)),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('TV listings could not be checked.'), findsOneWidget);
      expect(find.textContaining('No verified broadcasts'), findsNothing);
      api.failBroadcast = false;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Live now on Antena 1'), findsOneWidget);
      expect(tester.widget<ListTile>(find.byType(ListTile)).onTap, isNull);
    },
  );
  testWidgets(
    'custom reminders validate bounds and past times, show preview and return exact minutes',
    (tester) async {
      final start = DateTime.now().add(const Duration(hours: 2));
      final p = TvProgram(
        id: 'p',
        title: 'A film',
        channel: 'Antena 1',
        startsAt: start,
        endsAt: start.add(const Duration(hours: 2)),
      );
      int? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  result = await showModalBottomSheet<int>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => ReminderSheet(program: p),
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
      await tester.enterText(find.byType(TextField), '1441');
      await tester.tap(find.text('Set reminder'));
      await tester.pumpAndSettle();
      expect(find.text('Enter whole minutes from 0 to 1440.'), findsOneWidget);
      await tester.enterText(find.byType(TextField), '180');
      await tester.tap(find.text('Set reminder'));
      await tester.pumpAndSettle();
      expect(
        find.text('That time has passed. Choose fewer minutes.'),
        findsOneWidget,
      );
      await tester.enterText(find.byType(TextField), '17');
      await tester.pump();
      expect(find.textContaining('Notify me'), findsOneWidget);
      await tester.tap(find.text('Set reminder'));
      await tester.pumpAndSettle();
      expect(result, 17);
    },
  );
  test('broadcast copy uses live and calendar-relative days', () {
    final now = DateTime(2030, 1, 1, 23, 50);
    TvProgram at(DateTime time) => TvProgram(
      id: 'p',
      title: 'Movie',
      channel: 'Antena 1',
      startsAt: time,
      endsAt: time.add(const Duration(hours: 2)),
    );
    expect(
      broadcastLabel(at(now.subtract(const Duration(minutes: 30))), now: now),
      'Live now on Antena 1',
    );
    expect(
      broadcastLabel(at(now.add(const Duration(minutes: 30))), now: now),
      'Tomorrow on Antena 1',
    );
    expect(
      broadcastLabel(at(now.add(const Duration(days: 3))), now: now),
      'In 3 days on Antena 1',
    );
  });
}
