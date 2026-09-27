import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/services/notification_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dexterous.com/flutter/local_notifications');
  final calls = <MethodCall>[];
  var permission = true;
  var exactPermission = true;
  var initialized = true;
  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    AndroidFlutterLocalNotificationsPlugin.registerWith();
    permission = true;
    exactPermission = true;
    initialized = true;
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          if (call.method == 'initialize') return initialized;
          if (call.method == 'requestExactAlarmsPermission') {
            return exactPermission;
          }
          if (call.method == 'requestNotificationsPermission' ||
              call.method == 'requestExactAlarmsPermission') {
            return permission;
          }
          return null;
        });
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
  test(
    'schedules the UTC instant minus the selected offset, with one stable ID',
    () async {
      final service = NotificationService();
      final start = DateTime.now().toUtc().add(const Duration(hours: 2));
      final id = NotificationService.idFor('programme-1');
      await service.schedule(
        id: id,
        title: 'Test programme',
        startsAt: start,
        offsetMinutes: 10,
      );
      final args =
          calls.firstWhere((c) => c.method == 'zonedSchedule').arguments as Map;
      expect(args['id'], id);
      expect(
        DateTime.parse('${args['scheduledDateTime']}Z')
            .difference(start.subtract(const Duration(minutes: 10)))
            .inSeconds
            .abs(),
        lessThan(2),
      );
      await service.cancel(id);
      expect(calls.last.method, 'cancel');
      await service.cancelAll();
      expect(calls.last.method, 'cancelAll');
    },
  );
  test('permission denial never schedules a notification', () async {
    permission = false;
    await expectLater(
      NotificationService().schedule(
        id: 1,
        title: 'Test',
        startsAt: DateTime.now().add(const Duration(hours: 1)),
        offsetMinutes: 0,
      ),
      throwsStateError,
    );
    expect(calls.any((c) => c.method == 'zonedSchedule'), isFalse);
  });
  test('past reminder is rejected before requesting permission', () async {
    await expectLater(
      NotificationService().schedule(
        id: 1,
        title: 'Test',
        startsAt: DateTime.now().subtract(const Duration(minutes: 1)),
        offsetMinutes: 0,
      ),
      throwsStateError,
    );
    expect(calls, isEmpty);
  });
  test('different programs have distinct stable notification IDs', () {
    expect(
      NotificationService.idFor('programme-1'),
      NotificationService.idFor('programme-1'),
    );
    expect(
      NotificationService.idFor('programme-1'),
      isNot(NotificationService.idFor('programme-2')),
    );
  });
  test('cold process logout cancels existing OS notifications without a permission prompt', () async {
    await NotificationService().cancelAll();
    expect(calls.map((c) => c.method), ['initialize', 'cancelAll']);
  });
  test('exact alarm denial never schedules', () async {
    exactPermission = false;
    await expectLater(
      NotificationService().schedule(
        id: 1,
        title: 'Test',
        startsAt: DateTime.now().add(const Duration(hours: 1)),
        offsetMinutes: 0,
      ),
      throwsStateError,
    );
    expect(calls.any((c) => c.method == 'zonedSchedule'), isFalse);
  });
  test(
    'failed initialization never requests permission or schedules',
    () async {
      initialized = false;
      await expectLater(
        NotificationService().schedule(
          id: 1,
          title: 'Test',
          startsAt: DateTime.now().add(const Duration(hours: 1)),
          offsetMinutes: 0,
        ),
        throwsStateError,
      );
      expect(calls.map((c) => c.method), ['initialize']);
    },
  );
  test('invalid offsets fail before touching the platform', () async {
    for (final offset in [-1, 1441]) {
      await expectLater(
        NotificationService().schedule(
          id: 1,
          title: 'Test',
          startsAt: DateTime.now().add(const Duration(days: 2)),
          offsetMinutes: offset,
        ),
        throwsArgumentError,
      );
    }
    expect(calls, isEmpty);
  });
}
