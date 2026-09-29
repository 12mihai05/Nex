import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/widgets/catalog_filter_sheet.dart';
import 'package:nex/src/models/discovery_rows.dart';
import 'package:nex/src/widgets/streaming_service_chips.dart';
import 'package:nex/src/core/theme.dart';

void main() {
  for (final theme in [NexTheme.dark, NexTheme.light]) {
    testWidgets(
      'streaming pills have readable paired colors ${theme.brightness}',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: Scaffold(
              body: StreamingServiceChips(
                services: const {8: 'Netflix', 119: 'Prime Video'},
                selected: const {8},
                onChanged: (_) {},
              ),
            ),
          ),
        );
        for (final chip in tester.widgetList<FilterChip>(
          find.byType(FilterChip),
        )) {
          final foreground = chip.labelStyle!.color!.computeLuminance();
          final background =
              (chip.selected ? chip.selectedColor! : chip.backgroundColor!)
                  .computeLuminance();
          final ratio = foreground > background
              ? (foreground + .05) / (background + .05)
              : (background + .05) / (foreground + .05);
          expect(ratio, greaterThanOrEqualTo(4.5));
        }
      },
    );
  }
  testWidgets(
    'viewing and temporary services are returned without changing profile sets',
    (tester) async {
      final subscriptions = {8, 119};
      CatalogFilters? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  result = await showModalBottomSheet<CatalogFilters>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => CatalogFilterSheet(
                      type: 'any',
                      services: const {8: 'Netflix', 119: 'Prime Video'},
                      providers: subscriptions,
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
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'New to me'))
            .selected,
        isTrue,
      );
      await tester.ensureVisible(find.text('Watch again'));
      await tester.tap(find.text('Watch again'));
      await tester.pump();
      await tester.ensureVisible(find.text('Prime Video'));
      await tester.tap(find.text('Prime Video'));
      await tester.pump();
      await tester.ensureVisible(find.text('Show titles'));
      await tester.tap(find.text('Show titles'));
      await tester.pumpAndSettle();
      expect(result?.watchStatus, 'again');
      expect(result?.providers, {8});
      expect(subscriptions, {8, 119});
    },
  );
  testWidgets('an empty service selection never silently broadens results', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CatalogFilterSheet(type: 'movie', services: {8: 'Netflix'}),
        ),
      ),
    );
    await tester.ensureVisible(find.text('Netflix'));
    await tester.tap(find.text('Netflix'));
    await tester.pump();
    await tester.ensureVisible(find.text('Show titles'));
    await tester.tap(find.text('Show titles'));
    await tester.pump();
    expect(find.text('Select at least one streaming service.'), findsOneWidget);
  });
  test('rewatch identity survives parsing and incremental shelf append', () {
    final rows = parseDiscoveryRows([
      {
        'id': 'rewatch',
        'title': 'Watch again',
        'items': [
          {
            'item': {'id': 1, 'mediaType': 'movie', 'title': 'Seen favourite'},
          },
        ],
      },
    ]);
    expect(appendDiscoveryRows([], rows).single.id, 'rewatch');
  });
}
