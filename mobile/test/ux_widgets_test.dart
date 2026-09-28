import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/screens/browse_screen.dart';
import 'package:nex/src/screens/search_screen.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/preparation_screen.dart';

import 'stable_discovery_test.dart' show MutableApi;
import 'ux_state_test.dart' show DelayedApi;

void main() {
  testWidgets('preparation has an honest phase, not a percentage or spinner', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: NexTheme.light,
        home: const PreparationScreen(phase: 'Saving your choices'),
      ),
    );
    expect(find.text('Saving your choices'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    await tester.pump(const Duration(seconds: 4));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'search shows waiting immediately and only then an empty result',
    (tester) async {
      final api = DelayedApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      await c.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp(home: const SearchScreen()),
        ),
      );
      await tester.enterText(find.byType(TextField), 'Unknown');
      await tester.pump();
      expect(find.text('Looking through the catalog…'), findsOneWidget);
      expect(find.text('No titles found. Try another spelling.'), findsNothing);
      await tester.pump(const Duration(milliseconds: 350));
      api.searches['Unknown']!.complete([]);
      await tester.pumpAndSettle();
      expect(
        find.text('No titles found. Try another spelling.'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('pull refresh cannot change shelves before confirmation', (
    tester,
  ) async {
    final api = MutableApi();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    await c.read(appControllerProvider.notifier).restoreSession();
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(home: const BrowseScreen()),
      ),
    );
    Future<void> open() async {
      final refresh = tester.widget<RefreshIndicator>(
        find.byType(RefreshIndicator),
      );
      refresh.onRefresh();
      await tester.pumpAndSettle();
      expect(find.text('A fresh set of stories?'), findsOneWidget);
      expect(api.recommendations, 1);
    }

    await open();
    await tester.tap(find.text('Keep these picks'));
    await tester.pumpAndSettle();
    expect(api.recommendations, 1);
    await open();
    await tester.tap(find.text('Refresh my shelves'));
    await tester.pumpAndSettle();
    expect(api.recommendations, 2);
    expect(tester.takeException(), isNull);
  });
  test(
    'primary text and button colors pass normal-text contrast in both modes',
    () {
      double contrast(Color a, Color b) {
        final x = a.computeLuminance(), y = b.computeLuminance();
        return (x > y ? x + .05 : y + .05) / (x > y ? y + .05 : x + .05);
      }

      for (final theme in [NexTheme.light, NexTheme.dark]) {
        final s = theme.colorScheme;
        expect(contrast(s.primary, s.surface), greaterThanOrEqualTo(4.5));
        expect(contrast(s.primary, s.onPrimary), greaterThanOrEqualTo(4.5));
        expect(contrast(s.onSurface, s.surface), greaterThanOrEqualTo(4.5));
      }
    },
  );
}
