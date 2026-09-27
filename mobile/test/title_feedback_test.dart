import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/title_feedback.dart';

void main() {
  testWidgets('adjacent seen and opinions remain independent at large text', (
    tester,
  ) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final item = container.read(appControllerProvider.notifier).catalog.first;
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: Scaffold(
            body: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(1.4)),
              child: SingleChildScrollView(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: TitleFeedback(item: item),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    for (final label in ['Like', 'Dislike', 'Meh', 'Super Like']) {
      expect(find.text(label), findsOneWidget);
    }
    await tester.tap(find.text('Dislike'));
    await tester.pumpAndSettle();
    expect(container.read(appControllerProvider).watched, isEmpty);
    await tester.tap(find.text('Mark as seen'));
    await tester.pumpAndSettle();
    expect(
      container.read(appControllerProvider).reactions[item.key],
      'dislike',
    );
    await tester.tap(find.text('Clear opinion'));
    await tester.pumpAndSettle();
    expect(container.read(appControllerProvider).watched, contains(item.key));
    expect(container.read(appControllerProvider).reactions, isEmpty);
    await tester.tap(find.text('Seen'));
    await tester.pumpAndSettle();
    expect(container.read(appControllerProvider).watched, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
