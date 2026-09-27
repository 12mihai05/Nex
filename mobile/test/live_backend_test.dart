import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nex/src/data/api_client.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/screens/home_shell.dart';
import 'package:nex/src/core/theme.dart';

// Real HTTP and image-cache timers need the live clock, not a fake-async widget
// clock. Ordinary offline widget tests retain the automated binding.
class LiveHttpBinding extends LiveTestWidgetsFlutterBinding {
  @override
  bool get overrideHttpClient => false;
}

void main() {
  LiveHttpBinding();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (call) async => Directory('build/verification/cache').absolute.path,
      );
  test(
    'Flutter client authenticates and uses the real backend over HTTP',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      final api = NexApiClient();
      await api.signIn(
        email: Platform.environment['NEX_TEST_EMAIL']!,
        password: Platform.environment['NEX_TEST_PASSWORD']!,
      );
      final settings = await api.settings();
      expect((settings['profile'] as Map)['country'], 'RO');
      final results = await api.search('Arrival');
      final arrival = results.firstWhere((i) => i.id == 329865);
      await api.saveWatchlist(arrival);
      expect(
        (await api.list('/api/me/watchlist')).any((r) => r['tmdbId'] == 329865),
        isTrue,
      );
      await api.react(arrival, 'super_like');
      expect(
        (await api.list('/api/me/history'))
            .any((r) => r['tmdbId'] == arrival.id),
        isFalse,
      );
      await api.markWatched(arrival);
      expect((await api.list('/api/me/taste')).isNotEmpty, isTrue);
      final recommendations = await api.recommend();
      expect(recommendations, isNotEmpty);
      expect(recommendations.first['reason'], isA<String>());
      expect((await api.list('/api/tv/upcoming')).isNotEmpty, isTrue);
      final directory = await api.list('/api/tv/channels');
      expect(directory, isNotEmpty);
      final channelId = directory.first['id'] as String;
      await api.setChannelFavorite(channelId, true);
      expect(
        (await api.list('/api/tv/channels?favorites=true'))
            .any((c) => c['id'] == channelId && c['favorite'] == true),
        isTrue,
      );
      final tv = await api.tvDiscover();
      expect(tv['live'], isA<List>());
      expect(tv['upcoming'], isA<List>());
      await api.setChannelFavorite(channelId, false);
      final chat = await api.chat('Where can I watch Arrival?');
      expect(
        (chat['blocks'] as List).any((b) => b['type'] == 'movie_carousel'),
        isTrue,
      );
      final action = await api.chat(
        'add the first one to watchlist',
        sessionId: chat['sessionId'] as String,
      );
      expect(
        (action['blocks'] as List).any((b) => b['type'] == 'confirmation'),
        isTrue,
      );
      await api.removeWatchlist(arrival);
      final restoredContainer = ProviderContainer();
      try {
        expect(
          await restoredContainer
              .read(appControllerProvider.notifier)
              .restoreSession(),
          isTrue,
        );
        expect(restoredContainer.read(appControllerProvider).demoMode, isFalse);
        expect(
          restoredContainer.read(appControllerProvider).reactions[arrival.key],
          'super_like',
        );
        expect(
          restoredContainer.read(appControllerProvider).watched,
          contains(arrival.key),
        );
        await restoredContainer
            .read(appControllerProvider.notifier)
            .react(arrival, 'meh');
        await restoredContainer
            .read(appControllerProvider.notifier)
            .refreshLive();
        expect(
          restoredContainer.read(appControllerProvider).reactions[arrival.key],
          'meh',
        );
        await restoredContainer
            .read(appControllerProvider.notifier)
            .react(arrival, null);
        expect(
          (await api.list('/api/me/history'))
              .any((r) => r['tmdbId'] == arrival.id),
          isTrue,
        );
        await api.removeWatched(arrival);
        expect(
          (await api.list('/api/me/feedback'))
              .any((r) => r['tmdbId'] == arrival.id),
          isFalse,
        );
      } finally {
        restoredContainer.dispose();
      }
      await api.signOut();
      await expectLater(api.settings(), throwsA(anything));
    },
    skip: Platform.environment['NEX_TEST_PASSWORD'] == null,
    timeout: const Timeout(Duration(minutes: 5)),
  );
  testWidgets(
    'live Browse renders real backend recommendations',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final controller = container.read(appControllerProvider.notifier);
      final ok = await tester.runAsync(
        () => controller.authenticate(
          create: false,
          name: '',
          email: Platform.environment['NEX_TEST_EMAIL']!,
          password: Platform.environment['NEX_TEST_PASSWORD']!,
        ),
      );
      expect(ok, isTrue);
      expect(container.read(appControllerProvider).demoMode, isFalse);
      expect(controller.catalog, isNotEmpty);
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      await tester.binding.setSurfaceSize(const Size(430, 932));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final boundaryKey = GlobalKey();
      await tester.runAsync(() async {
        final font = File('C:/Windows/Fonts/arial.ttf');
        if (await font.exists()) {
          final loader = FontLoader('sans-serif')
            ..addFont(font.readAsBytes().then((b) => ByteData.sublistView(b)));
          await loader.load();
        }
        final icons = FontLoader('MaterialIcons')
          ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
        await icons.load();
      });
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: NexTheme.dark,
            home: RepaintBoundary(key: boundaryKey, child: const HomeShell()),
          ),
        ),
      );
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(seconds: 3)),
      );
      await tester.pump(const Duration(seconds: 2));
      expect(find.text(controller.catalog.first.title), findsWidgets);
      await tester.runAsync(() async {
        final image =
            await (boundaryKey.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary)
                .toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await Directory('build/verification').create(recursive: true);
        await File('build/verification/live-browse.png')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
      await tester.tap(find.byIcon(Icons.live_tv_outlined));
      await tester.pump();
      for (var attempt = 0; attempt < 45; attempt++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(seconds: 1)),
        );
        await tester.pump();
        if (find.byTooltip('Favorite channel').evaluate().isNotEmpty) break;
      }
      expect(find.text('Live now'), findsOneWidget);
      expect(find.byTooltip('Favorite channel'), findsWidgets);
      expect(tester.takeException(), isNull);
      await tester.runAsync(() async {
        final image =
            await (boundaryKey.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary)
                .toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File('build/verification/live-tv.png')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
      await tester.pumpWidget(const SizedBox.shrink());
    },
    skip: Platform.environment['NEX_TEST_PASSWORD'] == null,
    timeout: const Timeout(Duration(minutes: 5)),
  );
}
