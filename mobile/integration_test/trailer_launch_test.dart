import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nex/src/services/trailer_launcher.dart';

// Explicit opt-in: opens an external activity on the selected real device.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('real device opens an official trailer', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: Text('Nex trailer verification'))),
    );
    final result = await TrailerLauncher().open(
      'https://www.youtube.com/watch?v=YoHD9XEInc0',
    );
    expect(result, TrailerLaunchResult.opened);
  }, skip: !const bool.fromEnvironment('RUN_NATIVE_TRAILER_TEST'));
}
