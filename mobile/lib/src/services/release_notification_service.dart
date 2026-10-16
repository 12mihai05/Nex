import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/api_client.dart';
import 'notification_service.dart';

/// Existing local notifications only. No background polling or remote push SDK.
class ReleaseNotificationService with WidgetsBindingObserver {
  ReleaseNotificationService({NotificationService? notifications})
    : notifications = notifications ?? NotificationService.instance;
  final NotificationService notifications;
  static final instance = ReleaseNotificationService();
  static const popupKey = 'nex.releaseLocalPopups';
  NexApiClient? _api;
  Timer? _timer;
  int _generation = 0;
  bool _busy = false;

  Future<bool> enable() async {
    try {
      final allowed = await notifications.requestPermission(exactAlarm: false);
      await (await SharedPreferences.getInstance()).setBool(popupKey, allowed);
      return allowed;
    } catch (_) {
      return false;
    }
  }

  Future<bool> enabled() async =>
      (await SharedPreferences.getInstance()).getBool(popupKey) ?? false;
  Future<void> disable() async {
    await (await SharedPreferences.getInstance()).setBool(popupKey, false);
    await notifications.cancelReleaseUpdate();
  }

  Future<void> start(NexApiClient api, void Function(String) onOpen) async {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    WidgetsBinding.instance.addObserver(this);
    _api = api;
    _generation++;
    final ticket = _generation;
    notifications.onReleaseTap = onOpen;
    _timer = Timer.periodic(const Duration(minutes: 5), (_) => sync());
    try {
      final path = await notifications.initialReleasePath();
      if (ticket == _generation && path != null) onOpen(path);
    } catch (_) {
      /* Unsupported desktop/web platforms still have the inbox. */
    }
    if (ticket != _generation) return;
    await sync();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _timer?.cancel();
    if (state == AppLifecycleState.resumed) {
      sync();
      _timer = Timer.periodic(const Duration(minutes: 5), (_) => sync());
    }
  }

  Future<void> sync() async {
    final api = _api;
    if (_busy || api == null) return;
    final ticket = _generation;
    _busy = true;
    try {
      if (!await enabled() || ticket != _generation) return;
      final result = await api.releaseNotifications(pending: true);
      if (ticket != _generation) return;
      final items = (result['items'] as List).cast<Map>();
      if (items.isEmpty) return;
      // Group a catch-up batch instead of flooding the notification tray.
      await notifications.showReleaseUpdate(
        title: items.length == 1
            ? items.first['title'] as String
            : 'New release updates',
        body: items.length == 1
            ? items.first['body'] as String
            : '${items.length}${result['hasMore'] == true ? '+' : ''} updates in your Nex inbox.',
      );
      if (ticket != _generation) {
        await notifications.cancelReleaseUpdate();
        return;
      }
      await api.acknowledgeNotifications(
        items.map((r) => r['id'] as String).toList(),
        'popup',
      );
    } catch (_) {
      // Offline/permission failure keeps updates in the inbox for the next sync.
    } finally {
      _busy = false;
    }
  }

  Future<void> stop() async {
    _generation++;
    _api = null;
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    notifications.onReleaseTap = null;
    try {
      await notifications.cancelReleaseUpdate();
    } catch (_) {
      /* A missing OS plugin must not block logout/navigation. */
    }
  }
}
