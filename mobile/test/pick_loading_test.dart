import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/screens/browse_screen.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/skeleton.dart';

import 'stable_discovery_test.dart' show MutableApi;

class PickingApi extends MutableApi {
  final pending = Completer<Map<String, dynamic>>();
  int calls = 0;
  @override
  Future<Map<String, dynamic>> surprise({
    int? maxMinutes,
    String? mood,
    Set<int> excluded = const {},
  }) {
    calls++;
    return pending.future;
  }
}

void main() {
  testWidgets(
    'pick shows skeleton immediately, prevents repeat taps and recovers after an error',
    (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = PickingApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      await c.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: const MaterialApp(home: BrowseScreen()),
        ),
      );
      await tester.ensureVisible(find.byTooltip('Pick for me'));
      await tester.tap(find.byTooltip('Pick for me'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Make the pick'));
      await tester.tap(find.text('Make the pick'));
      await tester.pump();
      expect(find.byType(NexSkeleton), findsOneWidget);
      expect(find.text('Make the pick'), findsNothing);
      expect(api.calls, 1);
      api.pending.completeError(Exception('offline'));
      await tester.pumpAndSettle();
      expect(find.text('Make the pick'), findsOneWidget);
      expect(find.byType(NexSkeleton), findsNothing);
    },
  );
}
