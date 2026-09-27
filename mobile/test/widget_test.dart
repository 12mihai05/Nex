import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/app.dart';

void main() {
  testWidgets('Nex launches and enters the six-step demo onboarding', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: NexApp()));
    await tester.pumpAndSettle();
    expect(find.text('Nex'), findsOneWidget);
    expect(
      find.text('Your next great watch,\nwithout the hunt.'),
      findsOneWidget,
    );
    await tester.ensureVisible(find.text('Explore demo mode'));
    await tester.tap(find.text('Explore demo mode'));
    await tester.pumpAndSettle();
    expect(find.text('Where do you watch from?'), findsOneWidget);
    expect(find.text('1 / 6'), findsOneWidget);
  });
}
