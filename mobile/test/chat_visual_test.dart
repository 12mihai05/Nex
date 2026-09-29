import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/screens/chat_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'chat_actions_test.dart' show ChatActionsApi;

void main() {
  LiveTestWidgetsFlutterBinding();
  for (final dark in [true, false]) {
    testWidgets('Chat cards and help visual $dark', (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      await tester.binding.setSurfaceSize(const Size(430, 932));
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await (FontLoader('sans-serif')..addFont(
            File('C:/Windows/Fonts/arial.ttf')
                .readAsBytes()
                .then(ByteData.sublistView),
          ))
          .load();
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(ChatActionsApi())],
      );
      addTearDown(container.dispose);
      final controller = container.read(appControllerProvider.notifier);
      await controller.restoreSession();
      await controller.sendChat(
        'Add Inception to my watchlist and mark The Matrix seen and super like.',
      );
      final key = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: dark ? NexTheme.dark : NexTheme.light,
              home: const ChatScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      Future<void> capture(String name) async {
        final image =
            await (key.currentContext!.findRenderObject()
                    as RenderRepaintBoundary)
                .toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await Directory('build/verification').create(recursive: true);
        await File(
          'build/verification/chat-$name-${dark ? 'dark' : 'light'}.png',
        ).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
        expect(tester.takeException(), isNull);
      }

      await capture('cards');
      await tester.tap(find.byTooltip('What can Nex do?'));
      await tester.pumpAndSettle();
      await capture('help');
    }, skip: Platform.environment['NEX_VISUAL_QA'] != '1');
  }
}
