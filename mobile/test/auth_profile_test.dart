import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/app.dart';
import 'package:nex/src/screens/profile_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'library_restore_test.dart' show OfflineCatalogApi;

class NamedApi extends OfflineCatalogApi {
  bool deleted = false;
  @override
  Future<Map<String, dynamic>> settings() async => {
    ...await super.settings(),
    'user': {'name': 'Test Viewer'},
  };
  @override
  Future<void> deleteAccount({String? password}) async {
    deleted = true;
  }
}

void main() {
  testWidgets('auth content is balanced and scrolls above the keyboard', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    tester.view.physicalSize = const Size(430, 932);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpWidget(const ProviderScope(child: NexApp()));
    await tester.pumpAndSettle();

    void expectBalanced() {
      final top = tester.getTopLeft(find.text('Nex')).dy;
      final bottom = tester.getBottomLeft(find.byType(OutlinedButton)).dy;
      expect((top - (932 - bottom)).abs(), lessThan(24));
      final heading = find.text('Make Nex yours.').evaluate().isNotEmpty
          ? find.text('Make Nex yours.')
          : find.text('Sign in to Nex.');
      final fieldTop = tester.getTopLeft(find.byType(TextField).first).dy;
      expect(
        fieldTop - tester.getBottomLeft(heading).dy,
        greaterThanOrEqualTo(44),
      );
    }

    expectBalanced();
    await tester.tap(find.text('New here? Create an account'));
    await tester.pumpAndSettle();
    expectBalanced();
    tester.view.viewInsets = const FakeViewPadding(bottom: 350);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Explore demo mode'));
    await tester.pumpAndSettle();
    expect(find.text('Explore demo mode').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'password visibility works in login and registration; invite is independent',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      tester.view.physicalSize = const Size(430, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const ProviderScope(child: NexApp()));
      await tester.pumpAndSettle();
      Finder field(String label) => find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == label,
      );
      expect(tester.widget<TextField>(field('Password')).obscureText, isTrue);
      await tester.enterText(field('Password'), 'synthetic-test-value');
      await tester.tap(find.byTooltip('Show password'));
      await tester.pump();
      expect(tester.widget<TextField>(field('Password')).obscureText, isFalse);
      await tester.ensureVisible(find.text('New here? Create an account'));
      await tester.tap(find.text('New here? Create an account'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(field('Password')).obscureText, isTrue);
      expect(
        tester.widget<TextField>(field('Password')).controller!.text,
        'synthetic-test-value',
      );
      await tester.ensureVisible(find.byTooltip('Show password'));
      await tester.tap(find.byTooltip('Show password'));
      await tester.pump();
      expect(tester.widget<TextField>(field('Password')).obscureText, isFalse);
      expect(
        tester.widget<TextField>(field('Private invite code')).obscureText,
        isTrue,
      );
      await tester.ensureVisible(find.byTooltip('Show invite code'));
      await tester.tap(find.byTooltip('Show invite code'));
      await tester.pump();
      expect(
        tester.widget<TextField>(field('Private invite code')).obscureText,
        isFalse,
      );
      await tester.tap(find.byTooltip('Hide invite code'));
      await tester.pump();
      expect(
        tester.widget<TextField>(field('Private invite code')).obscureText,
        isTrue,
      );
    },
  );

  testWidgets(
    'profile restores the authenticated name and clears personal state after deletion',
    (tester) async {
      AndroidFlutterLocalNotificationsPlugin.registerWith();
      final notificationCalls = <String>[];
      const channel = MethodChannel(
        'dexterous.com/flutter/local_notifications',
      );
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            notificationCalls.add(call.method);
            return call.method == 'initialize' ? true : null;
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );
      final api = NamedApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      final controller = c.read(appControllerProvider.notifier);
      await controller.restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: const MaterialApp(home: ProfileScreen()),
        ),
      );
      expect(find.text('Test Viewer'), findsOneWidget);
      expect(find.text('Nex viewer'), findsNothing);
      await controller.deleteAccount();
      await tester.pump();
      expect(api.deleted, isTrue);
      expect(notificationCalls, contains('cancelAll'));
      final state = c.read(appControllerProvider);
      expect(state.displayName, isEmpty);
      expect(state.authenticated, isFalse);
      expect(state.watchlist, isEmpty);
      expect(state.watched, isEmpty);
      expect(state.reactions, isEmpty);
      expect(state.chatMessages, isEmpty);
      expect(state.reminderProgramIds, isEmpty);
      expect(find.text('Test Viewer'), findsNothing);
    },
  );
}
