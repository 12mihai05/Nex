import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../data/api_client.dart';
import 'notification_service.dart';

class ReleasePushService {
  static final instance = ReleasePushService();
  static const project = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const sender = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const nativeConfig = bool.fromEnvironment('RELEASE_PUSH_ENABLED');
  static bool get configured =>
      (nativeConfig || (project.isNotEmpty &&
      appId.isNotEmpty &&
      sender.isNotEmpty &&
      apiKey.isNotEmpty)) &&
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);
  StreamSubscription<String>? refresh;
  StreamSubscription<RemoteMessage>? foreground, opened;
  Future<void>? initializing;
  final notifications = FlutterLocalNotificationsPlugin();
  Future<void> initialize() =>
      initializing ??= _initialize().catchError((Object e) {
        initializing = null;
        throw e;
      });
  Future<void> _initialize() async {
    if (!configured) {
      throw StateError('Release notifications need Firebase setup.');
    }
    await Firebase.initializeApp(
      options: nativeConfig ? null : const FirebaseOptions(
        apiKey: apiKey,
        appId: appId,
        messagingSenderId: sender,
        projectId: project,
      ),
    );
    await NotificationService.instance.initialize();
    await notifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            'nex_releases',
            'Release updates',
            description: 'New seasons and movie releases you follow',
            importance: Importance.defaultImportance,
          ),
        );
  }

  Future<bool> enable(NexApiClient api) async {
    await initialize();
    final permission = await FirebaseMessaging.instance.requestPermission();
    if (![
      AuthorizationStatus.authorized,
      AuthorizationStatus.provisional,
    ].contains(permission.authorizationStatus)) {
      return false;
    }
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return false;
    await api.registerPush(token);
    return true;
  }

  Future<void> start(NexApiClient api, void Function(String) onOpen) async {
    if (!configured) return;
    try {
      await initialize();
      NotificationService.instance.onReleaseTap = onOpen;
      final permission = await FirebaseMessaging.instance
          .getNotificationSettings();
      if ([
        AuthorizationStatus.authorized,
        AuthorizationStatus.provisional,
      ].contains(permission.authorizationStatus)) {
        final token = await FirebaseMessaging.instance.getToken();
        if (token != null) await api.registerPush(token);
      }
      await refresh?.cancel();
      await foreground?.cancel();
      await opened?.cancel();
      refresh = FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        api.registerPush(token).catchError((_) {});
      });
      void navigate(RemoteMessage m) {
        final type = m.data['mediaType'];
        final id = int.tryParse(m.data['tmdbId'] ?? '');
        if (['movie', 'series'].contains(type) && id != null && id > 0) {
          onOpen('/title/$type/$id');
        }
      }

      opened = FirebaseMessaging.onMessageOpenedApp.listen(navigate);
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) navigate(initial);
      final local = await notifications.getNotificationAppLaunchDetails();
      final path = local?.notificationResponse?.payload;
      if (local?.didNotificationLaunchApp == true &&
          path != null &&
          RegExp(r'^/title/(movie|series)/[1-9][0-9]*$').hasMatch(path)) {
        onOpen(path);
      }
      foreground = FirebaseMessaging.onMessage.listen((m) {
        final id = m.data['eventId'] ?? m.messageId ?? '';
        notifications
            .show(
              id: id.hashCode & 0x7fffffff,
              title: m.notification?.title,
              body: m.notification?.body,
              payload: '/title/${m.data['mediaType']}/${m.data['tmdbId']}',
              notificationDetails: const NotificationDetails(
                android: AndroidNotificationDetails(
                  'nex_releases',
                  'Release updates',
                ),
                iOS: DarwinNotificationDetails(),
              ),
            )
            .catchError((_) {});
      });
    } catch (_) {
      /* Unconfigured push must never block sign-in or local TV reminders. */
    }
  }

  Future<void> stop(NexApiClient api) async {
    NotificationService.instance.onReleaseTap = null;
    await refresh?.cancel();
    await foreground?.cancel();
    await opened?.cancel();
    refresh = null;
    foreground = null;
    opened = null;
    if (!configured || Firebase.apps.isEmpty) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await api.unregisterPush(token);
    } catch (_) {
      /* Server session ownership also prevents delivery after logout. */
    }
  }
}
