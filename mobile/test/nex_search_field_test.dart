import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/widgets/nex_search_field.dart';

void main() {
  for (final dark in [false, true]) {
    testWidgets('clear search is conditional and notifies once, dark=$dark', (
      tester,
    ) async {
      final input = TextEditingController();
      addTearDown(input.dispose);
      final values = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: dark ? NexTheme.dark : NexTheme.light,
          home: Scaffold(
            body: NexSearchField(
              controller: input,
              onChanged: values.add,
              hintText: 'Find a title',
            ),
          ),
        ),
      );
      expect(find.byTooltip('Clear search'), findsNothing);
      await tester.enterText(find.byType(TextField), 'Dune');
      await tester.pump();
      expect(find.byTooltip('Clear search'), findsOneWidget);
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pump();
      expect(input.text, isEmpty);
      expect(values, ['Dune', '']);
      expect(find.byTooltip('Clear search'), findsNothing);
      // A restored query also updates the icon without a parent rebuild.
      input.text = '  ';
      await tester.pump();
      expect(find.byTooltip('Clear search'), findsOneWidget);
      input.clear();
      await tester.pump();
      expect(find.byTooltip('Clear search'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
