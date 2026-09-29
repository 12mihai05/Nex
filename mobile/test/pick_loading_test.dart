import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/screens/browse_screen.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/skeleton.dart';

import 'stable_discovery_test.dart' show MutableApi;

class PickingApi extends MutableApi {
  @override
  Future<Map<String, dynamic>> settings() async => {
    ...await super.settings(),
    'services': [
      {'providerId': 8, 'providerName': 'Netflix'},
      {'providerId': 119, 'providerName': 'Prime Video'},
    ],
  };
  final pending = Completer<Map<String, dynamic>>();
  int calls = 0;
  Set<int>? pickedProviders;
  String? pickedWatchStatus;
  final trailerRequests = <String>[];
  @override
  Future<Map<String, dynamic>> object(String path) async {
    trailerRequests.add(path);
    return {
      'videos': [
        {
          'name': 'Official trailer',
          'type': 'Trailer',
          'official': true,
          'url': 'https://www.youtube.com/watch?v=abcdefghijk',
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> surprise({
    int? maxMinutes,
    int? minMinutes,
    String mediaType = 'any',
    String? genre,
    String? mood,
    Set<int> excluded = const {},
    Set<int>? providers,
    String watchStatus = 'new',
  }) {
    calls++;
    pickedProviders = providers;
    pickedWatchStatus = watchStatus;
    return pending.future;
  }
}

void main() {
  testWidgets(
    'a completed pick loads its trailer without opening title details',
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
      expect(api.trailerRequests, isEmpty);
      await tester.ensureVisible(find.text('Make the pick'));
      await tester.tap(find.text('Make the pick'));
      await tester.pump();
      expect(api.trailerRequests, isEmpty);
      api.pending.complete({
        'item': {'id': 101, 'mediaType': 'movie', 'title': 'Selected movie'},
        'reason': 'For your taste.',
      });
      await tester.pumpAndSettle();
      expect(api.trailerRequests, ['/api/title/movie/101/extras']);
      expect(find.text('Watch trailer'), findsOneWidget);
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Watch trailer'),
            )
            .onPressed,
        isNotNull,
      );
      expect(find.text('Perfect — show details'), findsOneWidget);
      expect(find.text('Another one'), findsOneWidget);
    },
  );
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
      expect(find.text('Your streaming services'), findsOneWidget);
      await tester.ensureVisible(find.text('Service 119'));
      await tester.tap(find.text('Service 119'));
      await tester.pump();
      await tester.ensureVisible(find.text('Watch again'));
      await tester.tap(find.text('Watch again'));
      await tester.pump();
      await tester.ensureVisible(find.text('Make the pick'));
      await tester.tap(find.text('Make the pick'));
      await tester.pump();
      expect(find.byType(NexSkeleton), findsOneWidget);
      expect(find.text('Make the pick'), findsNothing);
      expect(api.calls, 1);
      expect(api.pickedWatchStatus, 'again');
      expect(api.pickedProviders, {8});
      expect(c.read(appControllerProvider).providers, {8, 119});
      api.pending.completeError(Exception('offline'));
      await tester.pumpAndSettle();
      expect(find.text('Make the pick'), findsOneWidget);
      expect(find.byType(NexSkeleton), findsNothing);
    },
  );
}
