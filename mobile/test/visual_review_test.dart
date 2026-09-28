import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/data/demo_data.dart';
import 'package:nex/src/screens/auth_screen.dart';
import 'package:nex/src/screens/onboarding_screen.dart';
import 'package:nex/src/screens/home_shell.dart';
import 'package:nex/src/screens/tv_screen.dart';
import 'package:nex/src/screens/browse_screen.dart';
import 'package:nex/src/screens/chat_screen.dart';
import 'package:nex/src/screens/search_screen.dart';
import 'package:nex/src/screens/profile_screen.dart';
import 'package:nex/src/screens/settings_screen.dart';
import 'package:nex/src/screens/taste_screen.dart';
import 'package:nex/src/screens/library_screen.dart';
import 'package:nex/src/screens/detail_screen.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/preparation_screen.dart';
import 'package:nex/src/widgets/delete_account_sheet.dart';

class VisualBinding extends LiveTestWidgetsFlutterBinding {
  @override
  bool get overrideHttpClient => false;
}

void main() {
  VisualBinding();
  final enabled = Platform.environment['NEX_VISUAL_QA'] == '1';
  for (final variant in ['dark', 'light', 'narrow-large']) {
    testWidgets(
      'major screens render: $variant',
      (tester) async {
        FlutterSecureStorage.setMockInitialValues({});
        final cache = await Directory('build/verification/cache')
            .create(recursive: true);
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(
              const MethodChannel('plugins.flutter.io/path_provider'),
              (call) async => cache.absolute.path,
            );
        final font = File('C:/Windows/Fonts/arial.ttf');
        if (await font.exists()) {
          await (FontLoader(
            'sans-serif',
          )..addFont(font.readAsBytes().then(ByteData.sublistView))).load();
        }
        await (FontLoader(
          'MaterialIcons',
        )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
        final size = variant == 'narrow-large'
            ? const Size(360, 800)
            : const Size(430, 932);
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        await tester.binding.setSurfaceSize(size);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final container = ProviderContainer();
        addTearDown(container.dispose);
        final controller = container.read(appControllerProvider.notifier);
        controller.enterDemo();
        await controller.toggleWatchlist(demoCatalog.first);
        await controller.markWatched(demoCatalog[1]);
        await controller.search('Arrival');
        await controller.sendChat('Something thoughtful under two hours');
        final routes = <String, Widget>{
          '/': const AuthScreen(),
          '/onboarding': const OnboardingScreen(),
          '/home': const HomeShell(),
          '/tv': const TvScreen(),
          '/catalog': const BrowseScreen(),
          '/chat': const ChatScreen(),
          '/search': const SearchScreen(),
          '/profile': const ProfileScreen(),
          '/settings': const SettingsScreen(),
          '/taste': const TasteScreen(),
          '/watchlist': const LibraryScreen(watched: false),
          '/history': const LibraryScreen(watched: true),
          '/detail': DetailScreen(item: demoCatalog.first),
          '/preparing': const PreparationScreen(
            phase: 'Curating your first shelves',
          ),
        };
        final router = GoRouter(
          routes: routes.entries
              .map((e) => GoRoute(path: e.key, builder: (_, _) => e.value))
              .toList(),
        );
        addTearDown(router.dispose);
        final boundary = GlobalKey();
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: RepaintBoundary(
              key: boundary,
              child: MaterialApp.router(
                debugShowCheckedModeBanner: false,
                routerConfig: router,
                theme: variant == 'light' ? NexTheme.light : NexTheme.dark,
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: TextScaler.linear(
                      variant == 'narrow-large' ? 1.4 : 1,
                    ),
                  ),
                  child: child!,
                ),
              ),
            ),
          ),
        );
        Future<void> capture(String name) async {
          await tester.pump(const Duration(milliseconds: 400));
          await Future<void>.delayed(const Duration(milliseconds: 1200));
          await tester.pump();
          expect(tester.takeException(), isNull, reason: '$variant/$name');
          final image =
              await (boundary.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary)
                  .toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await File('build/verification/$variant-$name.png')
              .writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        }

        for (final path in routes.keys) {
          router.go(path);
          await capture(path == '/' ? 'auth' : path.substring(1));
          if (path == '/') {
            await tester.ensureVisible(
              find.text('New here? Create an account'),
            );
            await tester.tap(find.text('New here? Create an account'));
            await capture('register');
          }
          if (path == '/onboarding') {
            for (var step = 2; step <= 6; step++) {
              await tester.tap(find.text('Continue'));
              await capture('onboarding-$step');
            }
          }
          if (path == '/settings') {
            await tester.tap(find.text('Country'));
            await capture('country-selector');
            expect(find.text('Romania'), findsWidgets);
            Navigator.of(tester.element(find.text('Romania').last)).pop();
            await tester.pump(const Duration(milliseconds: 400));
            showModalBottomSheet<void>(
              context: tester.element(find.byType(SettingsScreen)),
              isScrollControlled: true,
              useSafeArea: true,
              builder: (_) =>
                  DeleteAccountSheet(controller: controller, demo: false),
            );
            await capture('delete-account');
            Navigator.of(tester.element(find.text('Keep my account'))).pop();
            await tester.pump(const Duration(milliseconds: 400));
          }
          if (path == '/home') {
            await tester.tap(find.byTooltip('Pick for me'));
            await capture('pick-controls');
            await tester.tap(find.text('Make the pick'));
            await capture('pick-result');
            Navigator.of(tester.element(find.text('Another one'))).pop();
            await tester.pump(const Duration(milliseconds: 400));
          }
          if (path == '/tv') {
            for (
              var attempt = 0;
              attempt < 8 &&
                  find.text('Remind me').hitTestable().evaluate().isEmpty;
              attempt++
            ) {
              await tester.drag(
                find.byType(Scrollable).first,
                const Offset(0, -200),
              );
              await tester.pump(const Duration(milliseconds: 400));
            }
            await tester.tap(find.text('Remind me').hitTestable().first);
            await capture('reminder-controls');
            Navigator.of(tester.element(find.text('At start'))).pop();
            await tester.pump(const Duration(milliseconds: 400));
            await tester.pump(const Duration(milliseconds: 500));
            await tester.tap(
              find.byTooltip('Favorite channel').hitTestable().first,
            );
            await capture('tv-favorite');
            await tester.tap(find.text('Channel guide'));
            await capture('tv-guide');
          }
          if (path == '/catalog') {
            await tester.tap(find.text('Filters'));
            await capture('catalog-filters');
            Navigator.of(tester.element(find.text('Show titles'))).pop();
            await tester.pump(const Duration(milliseconds: 400));
          }
          if (path == '/detail' || path == '/settings' || path == '/taste') {
            await tester.drag(
              find.byType(Scrollable).first,
              const Offset(0, -600),
            );
            await capture('${path.substring(1)}-lower');
          }
        }
        router.go('/home');
        await capture('home');
        expect(
          find
              .byType(RawImage)
              .evaluate()
              .any((e) => (e.widget as RawImage).image != null),
          isTrue,
          reason: 'Real artwork should load',
        );
        await tester.pumpWidget(const SizedBox.shrink());
      },
      skip: !enabled,
      timeout: const Timeout(Duration(minutes: 6)),
    );
  }
}
