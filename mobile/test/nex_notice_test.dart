import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/widgets/nex_notice.dart';

void main() {
  for (final theme in [NexTheme.dark, NexTheme.light]) {
    testWidgets(
      'floating notice respects safe spacing and wraps long text ${theme.brightness}',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => showNexNotice(
                    context,
                    'The phone’s link launcher did not respond. You can copy the trailer link.',
                    action: SnackBarAction(
                      label: 'Copy link',
                      onPressed: () {},
                    ),
                  ),
                  child: const Text('Show'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Show'));
        await tester.pumpAndSettle();
        expect(theme.snackBarTheme.behavior, SnackBarBehavior.floating);
        expect(
          (theme.snackBarTheme.shape as RoundedRectangleBorder).borderRadius,
          BorderRadius.circular(24),
        );
        expect(find.byType(SnackBar), findsOneWidget);
        expect(tester.widget<SnackBar>(find.byType(SnackBar)).persist, isFalse);
        await tester.pump(const Duration(seconds: 6));
        await tester.pumpAndSettle();
        expect(find.byType(SnackBar), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
