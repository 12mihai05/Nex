import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/app.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

void main() {
  testWidgets('Nex launches and enters the six-step demo onboarding', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(const ProviderScope(child: NexApp()));
    await tester.pumpAndSettle();
    expect(find.text('Nex'), findsOneWidget);
    expect(find.text('Sign in to Nex.'), findsOneWidget);
    await tester.ensureVisible(find.text('Explore demo mode'));
    await tester.tap(find.text('Explore demo mode'));
    await tester.pumpAndSettle();
    expect(find.text('Where do you watch from?'), findsOneWidget);
    expect(find.text('1 / 6'), findsOneWidget);
  });
}
