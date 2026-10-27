import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/widgets/release_details.dart';
import 'package:nex/src/widgets/skeleton.dart';

import 'release_features_test.dart' show ReleaseApi, viewer;

class ControlledReleaseApi extends ReleaseApi {
  int reads = 0;
  final writes = <({String kind, bool enabled, Completer<void> result})>[];
  final initialSubscriptions = <Map<String, dynamic>>[];

  @override
  Future<Map<String, dynamic>> object(String path) async {
    if (!path.endsWith('/releases')) return super.object(path);
    reads++;
    return {
      'country': 'RO',
      'day': '2026-10-28',
      'releases': [
        {'kind': 'cinema', 'date': '2026-12-18'},
        {'kind': 'digital', 'date': '2027-03-18'},
      ],
      'subscriptions': initialSubscriptions,
    };
  }

  @override
  Future<void> setReleaseFollow(item, String kind, bool enabled) {
    final result = Completer<void>();
    writes.add((kind: kind, enabled: enabled, result: result));
    return result.future;
  }
}

ContentItem movie(int id) => ContentItem.fromJson({
  'id': id,
  'title': 'Upcoming movie $id',
  'releaseDate': '2026-12-18',
});

Widget screen(ProviderContainer container, ContentItem item) =>
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: ReleaseDetails(item: item)),
        ),
      ),
    );

Finder alert(String title) => find.widgetWithText(OutlinedButton, title);

bool isOn(WidgetTester tester, String title) => tester
    .widget<Semantics>(
      find.byWidgetPredicate(
        (widget) =>
            widget is Semantics &&
            widget.properties.label == '$title release alert',
      ),
    )
    .properties
    .toggled!;

void main() {
  testWidgets(
    'alerts change immediately and save independently without reloading dates',
    (tester) async {
      final api = ControlledReleaseApi();
      final container = await viewer(api);
      addTearDown(container.dispose);
      await tester.pumpWidget(screen(container, movie(1)));
      await tester.pumpAndSettle();
      final dateElement = tester.element(find.text('Expected Dec 18, 2026'));

      await tester.tap(alert('Cinema'));
      await tester.pump();
      expect(isOn(tester, 'Cinema'), isTrue);
      expect(tester.widget<OutlinedButton>(alert('Cinema')).onPressed, isNull);
      expect(
        tester.widget<OutlinedButton>(alert('Digital')).onPressed,
        isNotNull,
      );
      expect(find.byType(NexSkeleton), findsNothing);
      expect(
        tester.element(find.text('Expected Dec 18, 2026')),
        same(dateElement),
      );
      expect(api.reads, 1);

      await tester.tap(alert('Digital'));
      await tester.pump();
      expect(isOn(tester, 'Digital'), isTrue);
      expect(api.writes.length, 2);
      api.writes[0].result.complete();
      api.writes[1].result.completeError(Exception('offline'));
      await tester.pumpAndSettle();
      expect(isOn(tester, 'Cinema'), isTrue);
      expect(isOn(tester, 'Digital'), isFalse);
      expect(api.reads, 1);
      expect(find.text('Expected Dec 18, 2026'), findsOneWidget);

      await tester.tap(alert('Cinema'));
      await tester.pump();
      expect(isOn(tester, 'Cinema'), isFalse);
      expect(api.writes.last.enabled, isFalse);
      api.writes.last.result.complete();
      await tester.pumpAndSettle();
      expect(isOn(tester, 'Cinema'), isFalse);
      expect(api.reads, 1);
      await tester.pump(const Duration(seconds: 6));
    },
  );

  testWidgets(
    'failed disabling restores the saved selection and allows retry',
    (tester) async {
      final api = ControlledReleaseApi()
        ..initialSubscriptions.add({'kind': 'cinema', 'enabled': true});
      final container = await viewer(api);
      addTearDown(container.dispose);
      await tester.pumpWidget(screen(container, movie(1)));
      await tester.pumpAndSettle();
      expect(isOn(tester, 'Cinema'), isTrue);
      await tester.tap(alert('Cinema'));
      await tester.pump();
      expect(isOn(tester, 'Cinema'), isFalse);
      api.writes.single.result.completeError(Exception('offline'));
      await tester.pumpAndSettle();
      expect(isOn(tester, 'Cinema'), isTrue);
      expect(
        find.textContaining('Could not update this alert'),
        findsOneWidget,
      );
      await tester.tap(alert('Cinema'));
      await tester.pump();
      api.writes.last.result.complete();
      await tester.pumpAndSettle();
      expect(isOn(tester, 'Cinema'), isFalse);
      expect(api.reads, 1);
      await tester.pump(const Duration(seconds: 6));
    },
  );

  testWidgets('changing titles ignores an old in-flight alert failure', (
    tester,
  ) async {
    final api = ControlledReleaseApi();
    final container = await viewer(api);
    addTearDown(container.dispose);
    await tester.pumpWidget(screen(container, movie(1)));
    await tester.pumpAndSettle();
    await tester.tap(alert('Cinema'));
    await tester.pump();
    await tester.pumpWidget(screen(container, movie(2)));
    await tester.pumpAndSettle();
    expect(isOn(tester, 'Cinema'), isFalse);
    api.writes.single.result.completeError(Exception('old request'));
    await tester.pumpAndSettle();
    expect(isOn(tester, 'Cinema'), isFalse);
    expect(find.textContaining('Could not update this alert'), findsNothing);
    expect(api.reads, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'leaving details while saving does not update a disposed widget',
    (tester) async {
      final api = ControlledReleaseApi();
      final container = await viewer(api);
      addTearDown(container.dispose);
      await tester.pumpWidget(screen(container, movie(1)));
      await tester.pumpAndSettle();
      await tester.tap(alert('Cinema'));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      api.writes.single.result.complete();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
