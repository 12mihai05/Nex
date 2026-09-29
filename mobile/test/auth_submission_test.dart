import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nex/src/screens/auth_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'library_restore_test.dart' show OfflineCatalogApi;

class AuthApi extends OfflineCatalogApi {
  AuthApi({this.complete = true});
  final bool complete;
  final credentials = Completer<void>();
  final profile = Completer<void>();
  final content = Completer<void>();
  int logins = 0, registrations = 0, profileReads = 0, discoveryReads = 0;
  bool failProfile = false;
  @override
  Future<bool> hasStoredSession() async => false;
  @override
  Future<void> signIn({required String email, required String password}) async {
    logins++;
    await credentials.future;
  }

  @override
  Future<void> signUp({
    required String name,
    required String email,
    required String password,
    required String inviteCode,
  }) async {
    registrations++;
    await credentials.future;
  }

  @override
  Future<Map<String, dynamic>> settings() async {
    profileReads++;
    await profile.future;
    if (failProfile) throw StateError('Profile unavailable');
    final result = await super.settings();
    (result['profile'] as Map)['onboardingComplete'] = complete;
    return result;
  }

  @override
  Future<List<Map<String, dynamic>>> list(String path) async {
    if (path.contains('discovery')) discoveryReads++;
    await content.future;
    return [];
  }
}

void main() {
  for (final create in [false, true]) {
    testWidgets(
      '${create ? 'registration' : 'sign-in'} stays locked until navigation, without waiting for content',
      (tester) async {
        final api = AuthApi(complete: !create);
        final container = ProviderContainer(
          overrides: [nexApiClientProvider.overrideWithValue(api)],
        );
        addTearDown(container.dispose);
        final router = GoRouter(
          routes: [
            GoRoute(path: '/', builder: (_, _) => const AuthScreen()),
            GoRoute(
              path: '/home',
              builder: (_, _) => const Scaffold(body: Text('Home destination')),
            ),
            GoRoute(
              path: '/onboarding',
              builder: (_, _) =>
                  const Scaffold(body: Text('Onboarding destination')),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp.router(routerConfig: router),
          ),
        );
        await tester.pumpAndSettle();
        if (create) {
          await tester.tap(find.text('New here? Create an account'));
          await tester.pumpAndSettle();
        }
        final button = find.byType(FilledButton);
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pump();
        expect(tester.widget<FilledButton>(button).onPressed, isNull);
        expect(
          tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
          isNull,
        );
        api.credentials.complete();
        await tester.pump();
        await tester.pump(const Duration(seconds: 3));
        expect(tester.widget<FilledButton>(button).onPressed, isNull);
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        // Controller guard also prevents non-UI callers from duplicating requests.
        expect(
          await container
              .read(appControllerProvider.notifier)
              .authenticate(create: create, name: '', email: '', password: ''),
          isFalse,
        );
        expect(api.logins + api.registrations, 1);
        api.profile.complete();
        await tester.pumpAndSettle();
        expect(
          find.text(create ? 'Onboarding destination' : 'Home destination'),
          findsOneWidget,
        );
        expect(api.content.isCompleted, isFalse);
        expect(api.profileReads, 1);
        if (create) expect(api.discoveryReads, 0);
        api.content.complete();
        await tester.pumpAndSettle();
      },
    );
  }

  test('profile retry after successful registration never creates the account twice', () async {
    final api = AuthApi(complete: false)..failProfile = true;
    api.credentials.complete();
    api.profile.complete();
    api.content.complete();
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    Future<bool> submit() => controller.authenticate(
      create: true,
      name: 'Test',
      email: 'test@example.test',
      password: 'test-password',
    );
    expect(await submit(), isFalse);
    expect(container.read(appControllerProvider).busy, isFalse);
    api.failProfile = false;
    expect(await submit(), isTrue);
    expect(api.registrations, 1);
    expect(api.profileReads, 2);
  });

  test('credential errors release the lock and permit a retry', () async {
    final api = AuthApi();
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    final result = controller.authenticate(
      create: false,
      name: '',
      email: 'test@example.test',
      password: 'invalid',
    );
    api.credentials.completeError(StateError('Invalid credentials'));
    expect(await result, isFalse);
    expect(container.read(appControllerProvider).busy, isFalse);
    expect(container.read(appControllerProvider).authenticated, isFalse);
    expect(
      await controller.authenticate(
        create: false,
        name: '',
        email: 'test@example.test',
        password: 'invalid',
      ),
      isFalse,
    );
    expect(api.logins, 2);
  });
}
