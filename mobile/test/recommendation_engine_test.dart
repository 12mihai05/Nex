import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/screens/taste_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'stable_discovery_test.dart' show MutableApi;

class EngineApi extends MutableApi {
  String engine = 'baseline';
  bool failSave = false;
  Completer<void>? pending;
  @override
  Future<Map<String, dynamic>> settings() async {
    final value = await super.settings();
    (value['profile'] as Map<String, dynamic>)['recommendationEngine'] = engine;
    return value;
  }

  @override
  Future<void> saveSettings(Map<String, dynamic> data) async {
    if (pending != null) await pending!.future;
    if (failSave) throw StateError('Unavailable');
    engine = data['recommendationEngine'] as String? ?? engine;
  }
}

void main() {
  test('engine persists/restores without refreshing Home; failure retains selection', () async {
    final api = EngineApi();
    final c = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(c.dispose);
    final controller = c.read(appControllerProvider.notifier);
    await controller.restoreSession();
    final calls = api.recommendations;
    await controller.setRecommendationEngine('semantic');
    expect(api.engine, 'semantic');
    expect(c.read(appControllerProvider).recommendationEngine, 'semantic');
    expect(api.recommendations, calls);
    await controller.restoreSession();
    expect(c.read(appControllerProvider).recommendationEngine, 'semantic');
    api.failSave = true;
    await expectLater(
      controller.setRecommendationEngine('semantic_ai'),
      throwsStateError,
    );
    expect(c.read(appControllerProvider).recommendationEngine, 'semantic');
  });

  testWidgets(
    'Taste offers reversible methods, holds loading until save, fits large text',
    (tester) async {
      final api = EngineApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      await c.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp(
            home: const TasteScreen(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: const TextScaler.linear(1.4)),
              child: child!,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Recommendation settings'));
      await tester.pumpAndSettle();
      final option = find.text('Story matching · experimental');
      await tester.ensureVisible(option);
      await tester.pumpAndSettle();
      api.pending = Completer<void>();
      await tester.tap(option);
      await tester.pump();
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(c.read(appControllerProvider).recommendationEngine, 'baseline');
      api.pending!.complete();
      await tester.pumpAndSettle();
      expect(c.read(appControllerProvider).recommendationEngine, 'semantic');
      expect(find.byType(LinearProgressIndicator), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
