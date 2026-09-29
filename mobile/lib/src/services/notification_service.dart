import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/foundation.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;
import 'package:intl/intl.dart';

class NotificationService {
  NotificationService();
  static final instance = NotificationService();
  final _plugin = FlutterLocalNotificationsPlugin();
  var _ready = false;

  Future<bool> initialize() async {
    if (_ready) return true;
    if (kIsWeb ||
        ![
          TargetPlatform.android,
          TargetPlatform.iOS,
        ].contains(defaultTargetPlatform)) {
      throw UnsupportedError(
        'TV notifications require the Android or iOS app.',
      );
    }
    tz_data.initializeTimeZones();
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('nex_notification'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );
    _ready = await _plugin.initialize(settings: settings) ?? false;
    return _ready;
  }

  Future<bool> requestPermission() async {
    if (!await initialize()) {
      throw StateError('Notification initialization failed.');
    }
    final androidPlugin = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    final android = await androidPlugin?.requestNotificationsPermission();
    final exactAlarm = await androidPlugin?.requestExactAlarmsPermission();
    final ios = await _plugin
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);
    return (android == null || android) &&
        (exactAlarm == null || exactAlarm) &&
        (ios ?? true);
  }

  Future<void> schedule({
    required int id,
    required String title,
    String? channelName,
    required DateTime startsAt,
    required int offsetMinutes,
  }) async {
    if (offsetMinutes < 0 || offsetMinutes > 1440) {
      throw ArgumentError('Invalid reminder offset.');
    }
    final when = startsAt.subtract(Duration(minutes: offsetMinutes));
    if (!when.isAfter(DateTime.now())) {
      throw StateError('That reminder time has already passed.');
    }
    if (!await requestPermission()) {
      throw StateError('Notification permission was denied.');
    }
    await _plugin.zonedSchedule(
      id: id,
      title: title,
      body: reminderBody(channelName, startsAt, offsetMinutes),
      scheduledDate: tz.TZDateTime.from(when, tz.local),
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'nex_tv_reminders',
          'TV reminders',
          channelDescription: 'Reminders you explicitly create for TV programs',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
    );
  }

  bool get _supported =>
      !kIsWeb &&
      [
        TargetPlatform.android,
        TargetPlatform.iOS,
      ].contains(defaultTargetPlatform);
  static String reminderBody(
    String? channelName,
    DateTime startsAt,
    int offsetMinutes,
  ) =>
      '${channelName ?? "TV reminder"} · ${DateFormat.Hm().format(startsAt.toLocal())} · ${offsetMinutes == 0 ? "Starting now" : "In $offsetMinutes min"}';
  Future<void> cancel(int id) async {
    if (_supported && await initialize()) await _plugin.cancel(id: id);
  }

  Future<void> cancelAll() async {
    // Pending OS notifications survive a process restart. A fresh service must
    // initialize (without requesting permission) before logout can cancel them.
    if (_supported && await initialize()) await _plugin.cancelAll();
  }

  // Stable across app processes and shared by Browse and Chat; String.hashCode
  // is not a persistence contract.
  static int idFor(String programId) {
    var hash = 2166136261;
    for (final code in programId.codeUnits) {
      hash = ((hash ^ code) * 16777619) & 0xffffffff;
    }
    return hash & 0x7fffffff;
  }
}
