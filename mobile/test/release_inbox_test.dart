import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nex/src/services/release_notification_service.dart';
import 'package:nex/src/services/notification_service.dart';
import 'package:nex/src/screens/notifications_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'stable_discovery_test.dart' show MutableApi;

class InboxApi extends MutableApi {
  int calls = 0, acknowledgements = 0;
  Completer<Map<String, dynamic>>? delayed;
  @override
  Future<Map<String, dynamic>> releaseNotifications({
    int offset = 0,
    bool pending = false,
  }) async {
    calls++;
    if (delayed != null) return delayed!.future;
    return {
      'items': pending && acknowledgements > 0
          ? []
          : [
              {
                'id': 'notification',
                'title': 'A new season',
                'body': 'Season 2 premiered today.',
                'mediaType': 'series',
                'tmdbId': 42,
                'readAt': null,
                'createdAt': '2026-10-10T10:00:00Z',
              },
            ],
      'hasMore': false,
    };
  }

  @override
  Future<void> acknowledgeNotifications(List<String> ids, String kind) async {
    acknowledgements++;
  }
}

class LocalNotifications extends NotificationService {
  int shown = 0, cancelled = 0;
  bool fail = false;
  @override
  Future<String?> initialReleasePath() async => null;
  @override
  Future<bool> requestPermission({bool exactAlarm = true}) async {
    expect(exactAlarm, isFalse);
    return !fail;
  }

  @override
  Future<void> showReleaseUpdate({
    required String title,
    required String body,
  }) async {
    if (fail) throw StateError('Permission denied');
    shown++;
  }

  @override
  Future<void> cancelReleaseUpdate() async {
    cancelled++;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(
    () => SharedPreferences.setMockInitialValues({
      ReleaseNotificationService.popupKey: true,
    }),
  );
  test('local popup acknowledges only after display and does not repeat on next sync', () async {
    final api = InboxApi(), local = LocalNotifications();
    final service = ReleaseNotificationService(notifications: local);
    try {
      expect(await service.enable(), isTrue);
      await service.start(api, (_) {});
      expect(local.shown, 1);
      expect(api.acknowledgements, 1);
      await service.sync();
      expect(local.shown, 1);
    } finally {
      await service.stop();
    }
  });
  test('failed local notification preserves inbox pending state', () async {
    final api = InboxApi(), local = LocalNotifications()..fail = true;
    final service = ReleaseNotificationService(notifications: local);
    try {
      await service.start(api, (_) {});
      expect(api.acknowledgements, 0);
      local.fail = false;
      await service.sync();
      expect(local.shown, 1);
      expect(api.acknowledgements, 1);
    } finally {
      await service.stop();
    }
  });
  test('logout while a fetch is in flight prevents stale-account popup and acknowledgement', () async {
    final api = InboxApi()..delayed = Completer<Map<String, dynamic>>();
    final local = LocalNotifications();
    final service = ReleaseNotificationService(notifications: local);
    final pending = service.start(api, (_) {});
    while (api.calls == 0) {
      await Future<void>.delayed(Duration.zero);
    }
    await service.stop();
    api.delayed!.complete({
      'items': [
        {'id': 'old-user', 'title': 'Private', 'body': 'Old user'},
      ],
      'hasMore': false,
    });
    await pending;
    expect(local.shown, 0);
    expect(api.acknowledgements, 0);
  });
  testWidgets('inbox shows saved updates independently of popup permissions', (
    tester,
  ) async {
    final api = InboxApi();
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    await container.read(appControllerProvider.notifier).restoreSession();
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: NotificationsScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('A new season'), findsOneWidget);
    expect(find.textContaining('app stays closed'), findsOneWidget);
    expect(api.acknowledgements, 0);
  });
}
