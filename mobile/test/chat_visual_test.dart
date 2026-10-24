import 'dart:io';
import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/screens/chat_screen.dart';
import 'package:nex/src/screens/taste_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'chat_actions_test.dart'
    show ChatActionsApi, TasteChatApi, SuggestionChatApi;

class NaturalChatApi extends ChatActionsApi {
  @override
  Future<Map<String, dynamic>> chat(
    String message, {
    String? sessionId,
    void Function(String)? onProgress,
  }) async => {
    'sessionId': 'natural-visual',
    'blocks': [
      {
        'type': 'text',
        'content': 'A quiet scene gives you room to notice what someone isn’t saying. A glance or a pause can change how you read the whole conversation.\n\nIs it that space to interpret things that you enjoy?',
      },
    ],
  };
}

class ProgressChatApi extends ChatActionsApi {
  final pending = Completer<void>();
  @override
  Future<Map<String, dynamic>> chat(
    String message, {
    String? sessionId,
    void Function(String)? onProgress,
  }) async {
    onProgress?.call('Checking your requested changes');
    await pending.future;
    return {
      'sessionId': 'progress',
      'blocks': [
        {'type': 'text', 'content': 'Ready to review.'},
      ],
    };
  }
}

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
      await tester.tap(find.byTooltip('Close help'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Clear chat'));
      await tester.pumpAndSettle();
      await capture('clear');
      await tester.tap(find.text('Keep chat'));
      await tester.pumpAndSettle();
      final naturalContainer = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(NaturalChatApi())],
      );
      addTearDown(naturalContainer.dispose);
      await naturalContainer
          .read(appControllerProvider.notifier)
          .restoreSession();
      await naturalContainer
          .read(appControllerProvider.notifier)
          .sendChat('Sometimes a quiet scene says more than a long speech.');
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: UncontrolledProviderScope(
            container: naturalContainer,
            child: MaterialApp(
              theme: dark ? NexTheme.dark : NexTheme.light,
              home: const ChatScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await capture('natural');
      final suggestionContainer = ProviderContainer(
        overrides: [
          nexApiClientProvider.overrideWithValue(SuggestionChatApi()),
        ],
      );
      addTearDown(suggestionContainer.dispose);
      await suggestionContainer
          .read(appControllerProvider.notifier)
          .restoreSession();
      await suggestionContainer
          .read(appControllerProvider.notifier)
          .sendChat('More with that same feeling');
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: UncontrolledProviderScope(
            container: suggestionContainer,
            child: MaterialApp(
              theme: dark ? NexTheme.dark : NexTheme.light,
              home: const ChatScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await capture('suggestions');
      final progressApi = ProgressChatApi();
      final progressContainer = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(progressApi)],
      );
      addTearDown(progressContainer.dispose);
      final progressController = progressContainer.read(
        appControllerProvider.notifier,
      );
      await progressController.restoreSession();
      final pendingReply = progressController.sendChat(
        'Add these to my watchlist.',
      );
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: UncontrolledProviderScope(
            container: progressContainer,
            child: MaterialApp(
              theme: dark ? NexTheme.dark : NexTheme.light,
              home: const ChatScreen(),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await capture('progress');
      progressApi.pending.complete();
      await pendingReply;
      final tasteContainer = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(TasteChatApi())],
      );
      addTearDown(tasteContainer.dispose);
      await tasteContainer
          .read(appControllerProvider.notifier)
          .restoreSession();
      await tasteContainer
          .read(appControllerProvider.notifier)
          .sendChat('I dislike Korean movies and series');
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: UncontrolledProviderScope(
            container: tasteContainer,
            child: MaterialApp(
              theme: dark ? NexTheme.dark : NexTheme.light,
              home: const TasteScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await capture('taste');
    }, skip: Platform.environment['NEX_VISUAL_QA'] != '1');
  }
}
